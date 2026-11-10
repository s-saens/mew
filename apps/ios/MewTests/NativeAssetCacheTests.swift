import XCTest
@testable import Mew

final class NativeAssetCacheTests: XCTestCase {
    private func entry(_ body: String = "console.log('mew')") -> NativeCacheEntry {
        let bytes = Data(body.utf8)
        return NativeCacheEntry(bodyBase64: bytes.base64EncodedString(), mimeType: "text/javascript", sha256: NativeAssetCache.digest(bytes), etag: "\"sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"", storedAt: Date().timeIntervalSince1970 * 1000)
    }

    func testCachesOnlyStaticCodeAndFontPaths() {
        for path in ["/assets/index-abc.js", "/assets/code.worker-X.mjs", "/fonts/Mew.woff2", "/assets/math.wasm"] {
            XCTAssertTrue(NativeAssetCache.isCachePath(path))
        }
        for path in ["/index.html", "/api/file", "/assets/../secrets.js", "/assets/.hidden.js", "/assets/a.js?token=secret", "/assets/a.json", "/assets/%2e%2e/a.js", "https://evil.com/assets/a.js"] {
            XCTAssertFalse(NativeAssetCache.isCachePath(path))
        }
    }

    func testNativeBytesPersistOutsideWebKitAndAreEndpointScoped() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = try NativeAssetCache(root: root)
        let value = entry()
        try await cache.put(namespace: "host-a", scope: "instance-a", path: "/assets/app.js", entry: value, kind: .mewlink)
        let hit = try await cache.get(namespace: "host-a", scope: "instance-a", path: "/assets/app.js")
        XCTAssertEqual(hit?.sha256, value.sha256)
        XCTAssertEqual(hit?.bodyBase64, value.bodyBase64)
        let otherHost = try await cache.get(namespace: "host-b", scope: "instance-a", path: "/assets/app.js")
        let otherInstance = try await cache.get(namespace: "host-a", scope: "instance-b", path: "/assets/app.js")
        XCTAssertNil(otherHost); XCTAssertNil(otherInstance)
        let reopened = try NativeAssetCache(root: root)
        let reopenedHit = try await reopened.get(namespace: "host-a", scope: "instance-a", path: "/assets/app.js")
        XCTAssertEqual(reopenedHit?.bodyBase64, value.bodyBase64)
    }

    func testRejectsIntegrityMismatchAndEvictsCorruptDiskEntry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = try NativeAssetCache(root: root)
        let value = entry()
        let bad = NativeCacheEntry(bodyBase64: Data("tampered".utf8).base64EncodedString(), mimeType: value.mimeType, sha256: value.sha256, etag: value.etag, storedAt: value.storedAt)
        do { try await cache.put(namespace: "host", scope: "instance", path: "/assets/app.js", entry: bad, kind: .mewlink); XCTFail("Expected integrity rejection") }
        catch NativeCacheError.integrityMismatch {}
        try await cache.put(namespace: "host", scope: "instance", path: "/assets/app.js", entry: value, kind: .mewlink)
        let file = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).first!
        try Data("broken".utf8).write(to: file)
        let hit = try await cache.get(namespace: "host", scope: "instance", path: "/assets/app.js")
        XCTAssertNil(hit)
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
    }

    func testQuotaEvictsEntriesAndDirectWeakETagDoesNotRelaxMewlink() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = try NativeAssetCache(root: root, maximumDiskBytes: 1)
        try await cache.put(namespace: "host", scope: "instance", path: "/assets/app.js", entry: entry(), kind: .mewlink)
        let hit = try await cache.get(namespace: "host", scope: "instance", path: "/assets/app.js")
        XCTAssertNil(hit)
        XCTAssertTrue(NativeAssetCache.validETag("W/\"a-b\"", kind: .direct))
        XCTAssertFalse(NativeAssetCache.validETag("W/\"a-b\"", kind: .mewlink))
        XCTAssertFalse(NativeAssetCache.validETag("\"etag\"\r\nSet-Cookie: value", kind: .direct))
    }

    func testMIMEIsBoundToStaticExtension() {
        XCTAssertTrue(NativeAssetCache.validMIME("text/javascript; charset=utf-8", path: "/assets/app.js"))
        XCTAssertTrue(NativeAssetCache.validMIME("font/woff2", path: "/fonts/Mew.woff2"))
        XCTAssertFalse(NativeAssetCache.validMIME("text/html", path: "/assets/app.js"))
        XCTAssertFalse(NativeAssetCache.validMIME("text/javascript", path: "/assets/app.css"))
        XCTAssertFalse(NativeAssetCache.validMIME("application/octet-stream", path: "/assets/app.js"))
    }
}
