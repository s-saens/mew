import Foundation
import WebKit

/// Keeps direct UI resources on the app origin while the native transport owns the upstream server.
@MainActor
final class NativeSchemeHandler: NSObject, WKURLSchemeHandler {
    private let transport: NativeHTTPTransport
    private let cache: NativeAssetCache
    private let namespace: String
    private let scope: String
    private var tasks: [ObjectIdentifier: Task<Void, Never>] = [:]

    init(transport: NativeHTTPTransport, cache: NativeAssetCache, namespace: String, scope: String) {
        self.transport = transport
        self.cache = cache
        self.namespace = namespace
        self.scope = scope
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let key = ObjectIdentifier(urlSchemeTask as AnyObject)
        tasks[key] = Task { [weak self] in
            guard let self else { return }
            defer { self.tasks.removeValue(forKey: key) }
            do {
                guard let url = urlSchemeTask.request.url, url.scheme == "mew-app", url.host == "workspace",
                      url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
                      ["GET", "HEAD"].contains(urlSchemeTask.request.httpMethod ?? "GET") else { throw NativeTransportError.invalidRequest }
                guard let address = URLComponents(url: url, resolvingAgainstBaseURL: false) else { throw NativeTransportError.invalidRequest }
                let path = address.percentEncodedPath + (address.percentEncodedQuery.map { "?" + $0 } ?? "")
                guard NativeHTTPTransport.validStaticPath(path) || NativeHTTPTransport.validPath(path) else { throw NativeTransportError.invalidRequest }
                var headers = urlSchemeTask.request.allHTTPHeaderFields?.map { [$0.key, $0.value] } ?? []
                let cacheable = NativeAssetCache.isCachePath(path) && urlSchemeTask.request.value(forHTTPHeaderField: "Range") == nil
                let cached: NativeCacheEntry?
                if cacheable { cached = try? await self.cache.get(namespace: self.namespace, scope: self.scope, path: path) }
                else { cached = nil }
                if let cached {
                    headers.removeAll { $0[0].lowercased() == "if-none-match" }
                    headers.append(["If-None-Match", cached.etag])
                }
                var (data, response) = try await self.transport.resource(path: path, headers: headers)
                if response.statusCode == 304 {
                    if let cached, let bytes = Data(base64Encoded: cached.bodyBase64), response.value(forHTTPHeaderField: "ETag") == cached.etag {
                        data = bytes
                        var freshHeaders = Dictionary(uniqueKeysWithValues: NativeHTTPTransport.responseHeaders(response).map { ($0[0], $0[1]) })
                        freshHeaders["content-type"] = cached.mimeType
                        guard let revalidated = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: freshHeaders) else { throw NativeTransportError.invalidResponse }
                        response = revalidated
                    } else {
                        headers.removeAll { $0[0].lowercased() == "if-none-match" }
                        (data, response) = try await self.transport.resource(path: path, headers: headers)
                    }
                } else if cacheable, response.statusCode == 200, data.count <= NativeAssetCache.maximumResourceBytes,
                          let etag = response.value(forHTTPHeaderField: "ETag"), NativeAssetCache.validETag(etag, kind: .direct) {
                    let entry = NativeCacheEntry(bodyBase64: data.base64EncodedString(), mimeType: response.mimeType ?? "application/octet-stream",
                        sha256: NativeAssetCache.digest(data), etag: etag, storedAt: Date().timeIntervalSince1970 * 1000)
                    // A failed disk write cannot prevent a freshly fetched resource from loading.
                    try? await self.cache.put(namespace: self.namespace, scope: self.scope, path: path, entry: entry, kind: .direct)
                }
                try Task.checkCancellation()
                guard self.tasks[key] != nil else { return }
                var responseHeaders = Dictionary(uniqueKeysWithValues: NativeHTTPTransport.responseHeaders(response).map { ($0[0], $0[1]) })
                responseHeaders["Content-Length"] = String(data.count)
                responseHeaders["X-Content-Type-Options"] = "nosniff"
                // API HTML/SVG remains an inert preview, never an app-script execution surface.
                if path.hasPrefix("/api/"), ["text/html", "image/svg+xml"].contains(response.mimeType ?? "") {
                    responseHeaders["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"
                }
                guard let result = HTTPURLResponse(url: url, statusCode: response.statusCode, httpVersion: "HTTP/1.1", headerFields: responseHeaders) else { throw NativeTransportError.invalidResponse }
                urlSchemeTask.didReceive(result)
                if urlSchemeTask.request.httpMethod != "HEAD" { urlSchemeTask.didReceive(data) }
                urlSchemeTask.didFinish()
            } catch {
                guard self.tasks[key] != nil, !Task.isCancelled else { return }
                urlSchemeTask.didFailWithError(error)
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        tasks.removeValue(forKey: ObjectIdentifier(urlSchemeTask as AnyObject))?.cancel()
    }

    func invalidate() {
        for task in tasks.values { task.cancel() }
        tasks.removeAll()
    }
}
