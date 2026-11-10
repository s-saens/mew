import Foundation
import CryptoKit

enum NativeCacheError: Error { case invalidRequest, integrityMismatch, resourceTooLarge, corruptEntry }

struct NativeCacheEntry: Codable {
    let bodyBase64: String
    let mimeType: String
    let sha256: String
    let etag: String
    let storedAt: Double
}

actor NativeAssetCache {
    static let maximumResourceBytes = 16 * 1024 * 1024
    static let maximumDiskBytes = 512 * 1024 * 1024
    private let root: URL
    private let maximumDiskBytes: Int
    private let files = FileManager.default

    init(root: URL? = nil, maximumDiskBytes: Int = NativeAssetCache.maximumDiskBytes) throws {
        let base = try root ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                      appropriateFor: nil, create: true).appendingPathComponent("Mew/StaticAssets-v1", isDirectory: true)
        self.root = base
        self.maximumDiskBytes = maximumDiskBytes
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var excluded = base
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
    }

    static func isCachePath(_ path: String) -> Bool {
        guard path.utf8.count <= 1024, !path.split(separator: "/").contains(where: { $0.hasPrefix(".") }) else { return false }
        return path.range(of: #"^/assets/[A-Za-z0-9_./~-]+\.(js|mjs|css|woff2?|ttf|otf|wasm)$"#, options: [.regularExpression, .caseInsensitive]) != nil
            || path.range(of: #"^/fonts/[A-Za-z0-9_./-]+\.(css|woff2?|ttf|otf)$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    static func validETag(_ etag: String, kind: ConnectionKind) -> Bool {
        if kind == .mewlink { return etag.range(of: #"^"sha256-[A-Za-z0-9_-]{43}(-gzip)?"$"#, options: .regularExpression) != nil }
        return etag.utf8.count <= 256 && etag.range(of: #"^(W/)?"[\x21\x23-\x7E]+"$"#, options: .regularExpression) != nil
    }

    static func validMIME(_ value: String, path: String) -> Bool {
        let mime = value.split(separator: ";", maxSplits: 1).first?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
        switch (path as NSString).pathExtension.lowercased() {
        case "js", "mjs": return ["text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript", "application/x-javascript"].contains(mime)
        case "css": return mime == "text/css"
        case "wasm": return mime == "application/wasm"
        case "woff": return ["font/woff", "application/font-woff", "application/x-font-woff", "application/octet-stream"].contains(mime)
        case "woff2": return ["font/woff2", "application/font-woff2", "application/octet-stream"].contains(mime)
        case "ttf": return ["font/ttf", "application/x-font-ttf", "application/font-sfnt", "application/octet-stream"].contains(mime)
        case "otf": return ["font/otf", "application/x-font-opentype", "application/font-sfnt", "application/octet-stream"].contains(mime)
        default: return false
        }
    }

    func get(namespace: String, scope: String, path: String) throws -> NativeCacheEntry? {
        let url = try entryURL(namespace: namespace, scope: scope, path: path)
        guard files.fileExists(atPath: url.path) else { return nil }
        do {
            let stored = try Data(contentsOf: url)
            guard stored.count <= Self.maximumResourceBytes * 2 else { throw NativeCacheError.corruptEntry }
            let entry = try JSONDecoder().decode(NativeCacheEntry.self, from: stored)
            guard let bytes = Data(base64Encoded: entry.bodyBase64), bytes.count <= Self.maximumResourceBytes,
                  Self.digest(bytes) == entry.sha256, Self.validMIME(entry.mimeType, path: path) else { throw NativeCacheError.corruptEntry }
            try files.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
            return entry
        } catch {
            try? files.removeItem(at: url)
            return nil
        }
    }

    func put(namespace: String, scope: String, path: String, entry: NativeCacheEntry, kind: ConnectionKind) throws {
        let url = try entryURL(namespace: namespace, scope: scope, path: path)
        guard entry.bodyBase64.utf8.count <= ((Self.maximumResourceBytes + 2) / 3) * 4,
              let bytes = Data(base64Encoded: entry.bodyBase64), bytes.count <= Self.maximumResourceBytes else { throw NativeCacheError.resourceTooLarge }
        guard entry.sha256.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil,
              Self.digest(bytes) == entry.sha256 else { throw NativeCacheError.integrityMismatch }
        guard Self.validETag(entry.etag, kind: kind), entry.mimeType.utf8.count <= 128,
              Self.validMIME(entry.mimeType, path: path),
              entry.mimeType.rangeOfCharacter(from: .controlCharacters) == nil,
              entry.storedAt.isFinite, entry.storedAt > 0 else { throw NativeCacheError.invalidRequest }
        let encoded = try JSONEncoder().encode(entry)
        try encoded.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        try prune()
    }

    func remove(namespace: String, scope: String, path: String) throws {
        let url = try entryURL(namespace: namespace, scope: scope, path: path)
        if files.fileExists(atPath: url.path) { try files.removeItem(at: url) }
    }

    func clear(namespace: String) throws {
        let prefix = Self.digest(Data(namespace.utf8)) + "-"
        for url in try files.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where url.lastPathComponent.hasPrefix(prefix) {
            try files.removeItem(at: url)
        }
    }

    private func entryURL(namespace: String, scope: String, path: String) throws -> URL {
        guard !scope.isEmpty, scope.utf8.count <= 2048, !namespace.isEmpty, Self.isCachePath(path) else { throw NativeCacheError.invalidRequest }
        let key = Self.digest(Data(namespace.utf8)) + "-" + Self.digest(Data((scope + "\u{0}" + path).utf8))
        return root.appendingPathComponent(key + ".json", isDirectory: false)
    }

    private func prune() throws {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        let entries = try files.contentsOfDirectory(at: root, includingPropertiesForKeys: keys)
            .compactMap { url -> (URL, Int, Date)? in
                let values = try? url.resourceValues(forKeys: Set(keys))
                guard values?.isRegularFile == true else { return nil }
                return (url, values?.fileSize ?? 0, values?.contentModificationDate ?? .distantPast)
            }.sorted { $0.2 < $1.2 }
        var total = entries.reduce(0) { $0 + $1.1 }
        for (url, bytes, _) in entries where total > maximumDiskBytes {
            try files.removeItem(at: url)
            total -= bytes
        }
    }
}
