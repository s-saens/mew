import Foundation
import WebKit

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    let connection: SavedConnection
    private let cache: NativeAssetCache
    private let notifications: NativeNotifications
    private let transport: NativeHTTPTransport?
    let documentToken = UUID().uuidString
    var ownsLocalDocument = false
    var reload: (() -> Void)?
    private var pendingRequests = 0
    private var invalidated = false
    private var frames: [String: WKFrameInfo] = [:]
    weak var webView: WKWebView?
    var pendingClick: String?

    init(connection: SavedConnection, cache: NativeAssetCache, notifications: NativeNotifications, transport: NativeHTTPTransport?) {
        self.connection = connection
        self.cache = cache
        self.notifications = notifications
        self.transport = transport
    }

    static func script(connection: SavedConnection, documentToken: String) throws -> String {
        guard let file = Bundle.main.url(forResource: "NativeBridge", withExtension: "js") else { throw NativeCacheError.invalidRequest }
        let descriptor: [String: Any] = ["kind": connection.kind.rawValue,
            "scope": connection.kind == .direct ? "direct:" + connection.origin : connection.namespace,
            "endpoint": connection.origin]
        let json = try JSONSerialization.data(withJSONObject: descriptor, options: [.sortedKeys])
        let token = try JSONSerialization.data(withJSONObject: [documentToken])
        let tokenJSON = String(decoding: token, as: UTF8.self).dropFirst().dropLast()
        return try String(contentsOf: file, encoding: .utf8)
            .replacingOccurrences(of: "__MEW_CONNECTION_JSON__", with: String(decoding: json, as: UTF8.self))
            .replacingOccurrences(of: "__MEW_DOCUMENT_TOKEN_JSON__", with: String(tokenJSON))
    }

    static func acceptsDirectFrame(isMainFrame: Bool, url: URL?, ownsLocalDocument: Bool) -> Bool {
        guard ownsLocalDocument, isMainFrame, let url else { return false }
        return url.absoluteString == "about:blank"
            || (url.scheme == "mew-app" && url.host == "workspace" && (url.path.isEmpty || url.path == "/"))
    }

    func accepts(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        guard let url = frame.request.url else { return false }
        if connection.kind == .direct {
            return Self.acceptsDirectFrame(isMainFrame: frame.isMainFrame, url: url, ownsLocalDocument: ownsLocalDocument)
        }
        guard origin.protocol == "https", origin.port == 0 || origin.port == 443 else { return false }
        if frame.isMainFrame {
            return origin.host == "mew.run" && url.path == connection.address.path
        }
        guard origin.host == "app.mew.run" else { return false }
        return url.path.range(of: #"^/launch/[A-Za-z0-9_-]+/?$"#, options: .regularExpression) != nil
            || url.path.range(of: #"^/__mew_ui/[A-Za-z0-9_-]+/index\.html$"#, options: .regularExpression) != nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void) {
        guard !invalidated, pendingRequests < 32, message.webView === webView, accepts(message.frameInfo), let request = message.body as? [String: Any], request["version"] as? Int == 1,
              request["documentToken"] as? String == documentToken,
              let operation = request["operation"] as? String else { replyHandler(["ok": false, "error": "Native access denied"], nil); return }
        let frameKey = message.frameInfo.request.url!.absoluteString
        if frames[frameKey] == nil, frames.count >= 8 { frames.removeAll() }
        frames[frameKey] = message.frameInfo
        if let click = pendingClick { pendingClick = nil; deliverClick(click) }
        pendingRequests += 1
        Task {
            defer { pendingRequests -= 1 }
            do {
                let result = try await perform(operation, request)
                replyHandler(["ok": true, "value": result], nil)
            } catch {
                replyHandler(["ok": false, "error": "Native operation failed"], nil)
            }
        }
    }

    func beginDocument() {
        ownsLocalDocument = false
        frames.removeAll()
    }

    func invalidate() {
        invalidated = true
        beginDocument()
        pendingClick = nil
        reload = nil
        webView = nil
    }

    func deliverClick(_ id: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id]), let detail = String(data: data, encoding: .utf8), let webView else { return }
        if frames.isEmpty { pendingClick = id; return }
        for frame in frames.values where accepts(frame) {
            webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('mew:native-notification-click',{detail:\(detail)}))", in: frame, in: .page, completionHandler: nil)
        }
    }

    func deliverSocketEvent(_ event: [String: Any]) {
        guard let webView, connection.kind == .direct,
              let data = try? JSONSerialization.data(withJSONObject: event), let detail = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('mew-native-socket',{detail:\(detail)}))", completionHandler: nil)
    }

    private func perform(_ operation: String, _ request: [String: Any]) async throws -> Any {
        switch operation {
        case "cache.get", "cache.put", "cache.remove":
            guard let scope = request["scope"] as? String, let path = request["path"] as? String else { throw NativeCacheError.invalidRequest }
            if operation == "cache.get" {
                guard let entry = try await cache.get(namespace: connection.namespace, scope: scope, path: path) else { return NSNull() }
                return try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry))
            }
            if operation == "cache.remove" { try await cache.remove(namespace: connection.namespace, scope: scope, path: path); return true }
            guard let bytes = request["bodyBase64"] as? String, let mime = request["mimeType"] as? String,
                  let digest = request["sha256"] as? String, let etag = request["etag"] as? String,
                  let stored = request["storedAt"] as? Double else { throw NativeCacheError.invalidRequest }
            try await cache.put(namespace: connection.namespace, scope: scope, path: path,
                entry: NativeCacheEntry(bodyBase64: bytes, mimeType: mime, sha256: digest, etag: etag, storedAt: stored), kind: connection.kind)
            return true
        case "notifications.permission": return await notifications.permission()
        case "notifications.request": return try await notifications.request()
        case "notifications.show":
            guard let id = request["id"] as? String, let title = request["title"] as? String else { throw NativeCacheError.invalidRequest }
            try await notifications.show(connectionID: connection.id, id: id, title: title, body: request["body"] as? String ?? "")
            return true
        case "notifications.close":
            guard let id = request["id"] as? String else { throw NativeCacheError.invalidRequest }
            notifications.close(connectionID: connection.id, id: id)
            return true
        case "http.fetch":
            guard let transport else { throw NativeCacheError.invalidRequest }
            return try await transport.fetch(request)
        case "http.cancel":
            guard let transport, let id = request["id"] as? String else { throw NativeCacheError.invalidRequest }
            transport.cancel(id: id)
            return true
        case "http.reload":
            guard transport != nil else { throw NativeCacheError.invalidRequest }
            Task { @MainActor [weak self] in self?.reload?() }
            return true
        case "socket.open":
            guard let transport else { throw NativeCacheError.invalidRequest }
            try await transport.openSocket(request)
            return true
        case "socket.send":
            guard let transport else { throw NativeCacheError.invalidRequest }
            try await transport.sendSocket(request)
            return true
        case "socket.close":
            guard let transport else { throw NativeCacheError.invalidRequest }
            try await transport.closeSocket(request)
            return true
        default: throw NativeCacheError.invalidRequest
        }
    }
}
