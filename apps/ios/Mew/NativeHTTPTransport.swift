import Foundation

enum NativeTransportError: LocalizedError {
    case invalidRequest, connectionClosed, capacityExceeded, resourceTooLarge, invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidRequest: return "The app rejected an invalid connection request."
        case .connectionClosed: return "The connection has closed. Open it again to continue."
        case .capacityExceeded: return "Too many requests are running. Try again shortly."
        case .resourceTooLarge: return "This resource exceeds the app's transfer limit."
        case .invalidResponse: return "The server returned an unsupported response."
        }
    }
}

/// Owns one direct server connection. Web content never selects an upstream origin or supplies cookies.
@MainActor
final class NativeHTTPTransport: NSObject, URLSessionTaskDelegate, URLSessionWebSocketDelegate {
    nonisolated static let maximumBodyBytes = 32 * 1024 * 1024
    nonisolated static let maximumSocketBytes = 1024 * 1024
    let baseURL: URL
    private let onSocketEvent: ([String: Any]) -> Void
    private var requests: [String: Task<(Data, HTTPURLResponse), Error>] = [:]
    private var sockets: [String: Socket] = [:]
    private var closed = false
    private var generation = 0
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = .shared
        configuration.httpShouldSetCookies = true
        configuration.timeoutIntervalForRequest = 60
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    private final class Socket {
        let task: URLSessionWebSocketTask
        var receiver: Task<Void, Never>?
        var queuedBytes = 0
        var closing = false
        init(task: URLSessionWebSocketTask) { self.task = task }
    }

    init(baseURL: URL, onSocketEvent: @escaping ([String: Any]) -> Void) {
        self.baseURL = baseURL
        self.onSocketEvent = onSocketEvent
    }

    nonisolated static func validPath(_ value: String, socket: Bool = false) -> Bool {
        guard value.utf8.count <= 8192, value.hasPrefix("/api/"),
              !value.contains("\\"), !value.contains("#"),
              value.rangeOfCharacter(from: .controlCharacters) == nil,
              value.range(of: #"%(00|0d|0a)"#, options: [.regularExpression, .caseInsensitive]) == nil else { return false }
        let pathname = String(value.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0])
        guard pathname.range(of: #"%(2f|5c)"#, options: [.regularExpression, .caseInsensitive]) == nil,
              !pathname.split(separator: "/").contains(where: { let part = $0.removingPercentEncoding; return part == "." || part == ".." }),
              let url = URL(string: value, relativeTo: URL(string: "https://mew.invalid")!), url.host == "mew.invalid",
              url.path == (pathname.removingPercentEncoding ?? pathname),
              pathname != "/api/port-preview", !pathname.hasPrefix("/api/port-preview/") else { return false }
        if socket {
            return ["/api/tmux/ws", "/api/agent/ws", "/api/presence", "/api/live/ws", "/api/collab", "/api/db/ws", "/api/browser-desktop/ws", "/api/dom-browser/ws"].contains(pathname)
        }
        // Direct connections retain the host's ordinary authorization, including first-owner setup.
        return true
    }

    nonisolated static func validStaticPath(_ value: String) -> Bool {
        guard value.utf8.count <= 1024, !value.contains("%"), !value.contains("?"), !value.contains("#"), !value.contains("\\"),
              !value.split(separator: "/").contains(where: { $0.hasPrefix(".") }),
              value.range(of: #"^/[A-Za-z0-9_./~-]+\.(html|js|mjs|css|json|svg|png|ico|jpe?g|webp|avif|gif|woff2?|ttf|otf|wasm|txt|bcmap|pfb|icc|bin)$"#, options: [.regularExpression, .caseInsensitive]) != nil else { return false }
        return value.hasPrefix("/assets/") || value.hasPrefix("/fonts/") || value.hasPrefix("/pdf-assets/") || value.split(separator: "/").count == 1
    }

    func fetch(_ input: [String: Any]) async throws -> [String: Any] {
        guard let id = input["id"] as? String, Self.validID(id), let path = input["path"] as? String, Self.validPath(path),
              let method = input["method"] as? String, ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].contains(method),
              let pairs = input["headers"] as? [[String]], pairs.count <= 32,
              requests.keys.filter({ $0.hasPrefix("http:") }).count < 16 else { throw NativeTransportError.invalidRequest }
        let body: Data?
        if let encoded = input["bodyBase64"] {
            guard let string = encoded as? String, string.utf8.count <= ((Self.maximumBodyBytes + 2) / 3) * 4,
                  let decoded = Data(base64Encoded: string), decoded.count <= Self.maximumBodyBytes,
                  !["GET", "HEAD"].contains(method) else { throw NativeTransportError.resourceTooLarge }
            body = decoded
        } else { body = nil }
        let (data, response) = try await request(path: path, method: method, headers: pairs, body: body, id: "http:" + id)
        return ["status": response.statusCode, "headers": Self.responseHeaders(response), "bodyBase64": data.base64EncodedString()]
    }

    func cancel(id: String) { requests["http:" + id]?.cancel() }

    func loadIndex() async throws -> String {
        let (data, response) = try await request(path: "/", id: "index:" + UUID().uuidString, limit: 512 * 1024)
        guard response.statusCode == 200, response.mimeType == "text/html", let html = String(data: data, encoding: .utf8),
              html.range(of: #"<head(?:\s[^>]*)?>"#, options: [.regularExpression, .caseInsensitive]) != nil,
              html.range(of: #"name=["']mew-p2p-bootstrap["']\s+content=["']1["']"#, options: .regularExpression) != nil else { throw NativeTransportError.invalidResponse }
        return html
    }

    func resource(path: String, headers: [[String]]) async throws -> (Data, HTTPURLResponse) {
        guard Self.validStaticPath(path) || Self.validPath(path) else { throw NativeTransportError.invalidRequest }
        return try await request(path: path, headers: headers, id: "resource:" + UUID().uuidString)
    }

    private func request(path: String, method: String = "GET", headers: [[String]] = [], body: Data? = nil,
                         id: String, limit: Int = NativeHTTPTransport.maximumBodyBytes) async throws -> (Data, HTTPURLResponse) {
        guard !closed else { throw NativeTransportError.connectionClosed }
        guard requests[id] == nil, requests.count < 64, let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              Self.sameOrigin(url, baseURL) else { throw NativeTransportError.capacityExceeded }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        for pair in headers {
            guard pair.count == 2, pair[1].utf8.count <= 8192, pair[1].rangeOfCharacter(from: .controlCharacters) == nil else { throw NativeTransportError.invalidRequest }
            let allowed = ["accept", "content-type", "range", "if-match", "if-none-match", "if-range", "x-mew-task-owner", "x-mew-git-owner", "x-mew-git-workspace", "x-mew-debug-workspace"]
            if allowed.contains(pair[0].lowercased()) { request.setValue(pair[1], forHTTPHeaderField: pair[0]) }
        }
        request.setValue(origin, forHTTPHeaderField: "Origin")
        let currentSession = session, outboundRequest = request, currentGeneration = generation
        let pending = Task.detached { () throws -> (Data, HTTPURLResponse) in
            let (bytes, rawResponse) = try await currentSession.bytes(for: outboundRequest)
            defer { bytes.task.cancel() }
            guard let response = rawResponse as? HTTPURLResponse else { throw NativeTransportError.invalidResponse }
            guard response.expectedContentLength <= Int64(limit) else { throw NativeTransportError.resourceTooLarge }
            var data = Data(), chunk = [UInt8]()
            chunk.reserveCapacity(64 * 1024)
            for try await byte in bytes {
                chunk.append(byte)
                if data.count + chunk.count > limit { throw NativeTransportError.resourceTooLarge }
                if chunk.count == 64 * 1024 {
                    try Task.checkCancellation()
                    data.append(contentsOf: chunk); chunk.removeAll(keepingCapacity: true)
                }
            }
            data.append(contentsOf: chunk)
            return (data, response)
        }
        requests[id] = pending
        defer { if generation == currentGeneration { requests.removeValue(forKey: id) } }
        return try await withTaskCancellationHandler(operation: { try await pending.value }, onCancel: { pending.cancel() })
    }

    func openSocket(_ input: [String: Any]) async throws {
        guard !closed, let id = input["id"] as? String, Self.validID(id), sockets[id] == nil, sockets.count < 16,
              let path = input["path"] as? String, Self.validPath(path, socket: true),
              let protocols = input["protocols"] as? [String], protocols.count <= 16, Set(protocols).count == protocols.count,
              protocols.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 256 && $0.range(of: #"^[!#$%&'*+\-.^_`|~\w]+$"#, options: .regularExpression) != nil }),
              let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: true) else { throw NativeTransportError.invalidRequest }
        parts.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        guard let socketURL = parts.url else { throw NativeTransportError.invalidRequest }
        var request = URLRequest(url: socketURL)
        request.setValue(origin, forHTTPHeaderField: "Origin")
        if !protocols.isEmpty { request.setValue(protocols.joined(separator: ", "), forHTTPHeaderField: "Sec-WebSocket-Protocol") }
        let task = session.webSocketTask(with: request)
        task.maximumMessageSize = Self.maximumSocketBytes
        sockets[id] = Socket(task: task)
        task.resume()
    }

    func sendSocket(_ input: [String: Any]) async throws {
        guard let id = input["id"] as? String, let socket = sockets[id], !socket.closing,
              let encoded = input["bodyBase64"] as? String, encoded.utf8.count <= ((Self.maximumSocketBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), data.count <= Self.maximumSocketBytes,
              let binary = input["binary"] as? Bool else { throw NativeTransportError.invalidRequest }
        guard socket.queuedBytes + data.count <= 4 * Self.maximumSocketBytes else { throw NativeTransportError.capacityExceeded }
        socket.queuedBytes += data.count
        defer { socket.queuedBytes -= data.count }
        if binary { try await socket.task.send(.data(data)) }
        else {
            guard let text = String(data: data, encoding: .utf8) else { throw NativeTransportError.invalidRequest }
            try await socket.task.send(.string(text))
        }
    }

    func closeSocket(_ input: [String: Any]) async throws {
        guard let id = input["id"] as? String, let socket = sockets[id] else { return }
        let code = input["code"] as? Int ?? 1000, reason = input["reason"] as? String ?? ""
        guard (code == 1000 || code == 1009 || (3000...4999).contains(code)), reason.utf8.count <= 123,
              let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) else { throw NativeTransportError.invalidRequest }
        socket.closing = true
        socket.task.cancel(with: closeCode, reason: Data(reason.utf8))
    }

    func reset() {
        generation += 1
        for request in requests.values { request.cancel() }
        requests.removeAll()
        for (id, socket) in sockets {
            socket.receiver?.cancel(); socket.task.cancel(with: .goingAway, reason: nil)
            onSocketEvent(["id": id, "type": "close", "code": 1001, "reason": "Connection closed", "wasClean": true])
        }
        sockets.removeAll()
    }

    func invalidate() {
        guard !closed else { return }
        closed = true
        reset()
        session.invalidateAndCancel()
    }

    private var origin: String { var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)!; parts.path = ""; return parts.string! }
    nonisolated private static func validID(_ id: String) -> Bool { id.range(of: #"^[A-Za-z0-9_:-]{1,100}$"#, options: .regularExpression) != nil }
    nonisolated private static func sameOrigin(_ left: URL, _ right: URL) -> Bool {
        left.scheme == right.scheme && left.host == right.host && left.port == right.port && left.user == nil && left.password == nil
    }
    nonisolated static func responseHeaders(_ response: HTTPURLResponse) -> [[String]] {
        response.allHeaderFields.compactMap { name, value in
            let key = String(describing: name).lowercased()
            guard !["set-cookie", "set-cookie2", "cookie", "authorization", "x-mew-session", "content-encoding", "content-length"].contains(key) else { return nil }
            return [key, String(describing: value)]
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                               newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        Task { @MainActor in completionHandler(request.url.map { Self.sameOrigin($0, self.baseURL) } == true ? request : nil) }
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        Task { @MainActor in
            guard let (id, socket) = self.sockets.first(where: { $0.value.task === webSocketTask }), !self.closed, !socket.closing else { return }
            self.onSocketEvent(["id": id, "type": "open", "protocol": `protocol` ?? ""])
            socket.receiver = Task { [weak self] in
                do {
                    while !Task.isCancelled {
                        let message = try await webSocketTask.receive()
                        guard let self, self.sockets[id] === socket, !self.closed else { return }
                        let data: Data, binary: Bool
                        switch message {
                        case .data(let value): data = value; binary = true
                        case .string(let value): data = Data(value.utf8); binary = false
                        @unknown default: throw NativeTransportError.invalidResponse
                        }
                        guard data.count <= Self.maximumSocketBytes else { throw NativeTransportError.resourceTooLarge }
                        self.onSocketEvent(["id": id, "type": "message", "bodyBase64": data.base64EncodedString(), "binary": binary])
                    }
                } catch {
                    guard let self, self.sockets[id] === socket, !socket.closing, !self.closed else { return }
                    self.onSocketEvent(["id": id, "type": "error"])
                    self.finishSocket(id: id, code: 1006, reason: "Connection interrupted", clean: false)
                }
            }
        }
    }

    nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                               didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        Task { @MainActor in
            guard let id = self.sockets.first(where: { $0.value.task === webSocketTask })?.key else { return }
            self.finishSocket(id: id, code: closeCode.rawValue, reason: reason.flatMap { String(data: $0, encoding: .utf8) } ?? "", clean: true)
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard error != nil else { return }
        Task { @MainActor in
            guard let id = self.sockets.first(where: { $0.value.task === task })?.key else { return }
            self.onSocketEvent(["id": id, "type": "error"])
            self.finishSocket(id: id, code: 1006, reason: "Connection failed", clean: false)
        }
    }

    private func finishSocket(id: String, code: Int, reason: String, clean: Bool) {
        guard let socket = sockets.removeValue(forKey: id) else { return }
        socket.receiver?.cancel()
        socket.task.cancel(with: .goingAway, reason: nil)
        onSocketEvent(["id": id, "type": "close", "code": code, "reason": reason, "wasClean": clean])
    }
}
