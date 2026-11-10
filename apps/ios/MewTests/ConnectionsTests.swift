import XCTest
@testable import Mew

final class ConnectionsTests: XCTestCase {
    func testSavedEndpointsNeverContainCredentialsOrTokens() throws {
        for address in ["https://user:password@example.com", "https://example.com/?token=secret", "https://example.com/#secret", "https://example.com/api/"] {
            XCTAssertThrowsError(try SavedConnection(name: "test", kind: .direct, address: address))
        }
    }

    func testHTTPRequiresExplicitConsentAndPrivateAddress() throws {
        XCTAssertThrowsError(try SavedConnection(name: "test", kind: .direct, address: "http://192.168.1.2"))
        XCTAssertThrowsError(try SavedConnection(name: "test", kind: .direct, address: "http://example.com", allowsLocalHTTP: true))
        for host in ["192.168.1.2", "100.100.10.1", "laptop.tail123.ts.net", "localhost", "[::1]", "[fd7a:115c:a1e0::1]"] {
            XCTAssertNoThrow(try SavedConnection(name: "test", kind: .direct, address: "http://\(host):5000", allowsLocalHTTP: true))
        }
        for host in ["172.32.0.1", "100.128.0.1", "999.168.0.1", "192.bad.168.1.2", "010.1.2.3", "fdmalicious:evil", "example.local.evil.com", "example.ts.net.evil.com"] {
            XCTAssertFalse(SavedConnection.isPrivateHost(host))
        }
    }

    func testMewlinkRequiresExactPublicDeviceAddress() throws {
        let connection = try SavedConnection(name: "Laptop", kind: .mewlink, address: "https://mew.run/alice/laptop/")
        XCTAssertEqual(connection.address.absoluteString, "https://mew.run/alice/laptop")
        XCTAssertEqual(try SavedConnection(name: "Default port", kind: .direct, address: "https://example.com:443").origin, "https://example.com")
        for address in ["https://evil.com/alice/laptop", "https://app.mew.run/launch/id", "http://mew.run/alice/laptop", "https://mew.run/alice", "https://mew.run/alice/laptop/api"] {
            XCTAssertThrowsError(try SavedConnection(name: "test", kind: .mewlink, address: address))
        }
    }

    @MainActor func testOnlyOwnedLocalMainDocumentGetsDirectBridge() {
        for address in ["mew-app://workspace/", "about:blank"] {
            XCTAssertTrue(NativeBridge.acceptsDirectFrame(isMainFrame: true, url: URL(string: address), ownsLocalDocument: true))
            XCTAssertFalse(NativeBridge.acceptsDirectFrame(isMainFrame: false, url: URL(string: address), ownsLocalDocument: true))
            XCTAssertFalse(NativeBridge.acceptsDirectFrame(isMainFrame: true, url: URL(string: address), ownsLocalDocument: false))
        }
        for address in ["mew-app://workspace/api/file", "mew-app://workspace/assets/evil.html", "mew-app://other/", "https://example.com/"] {
            XCTAssertFalse(NativeBridge.acceptsDirectFrame(isMainFrame: true, url: URL(string: address), ownsLocalDocument: true))
        }
    }

    @MainActor func testStoreRevalidatesDiskDataAndSavesMetadataOnly() throws {
        let suite = "MewTests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let connection = try SavedConnection(name: "Laptop", kind: .direct, address: "https://example.com")
        let store = ConnectionStore(defaults: defaults)
        store.save(connection)
        XCTAssertEqual(ConnectionStore(defaults: defaults).connections, [connection])
        let data = defaults.data(forKey: "mew.saved-connections.v1")!
        let object = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        XCTAssertEqual(Set(object[0].keys), ["id", "name", "kind", "address", "allowsLocalHTTP"])
        defaults.set(Data("[{\"id\":\"\(connection.id.uuidString)\",\"name\":\"secret\",\"kind\":\"direct\",\"address\":\"https://user:secret@example.com\",\"allowsLocalHTTP\":false}]".utf8), forKey: "mew.saved-connections.v1")
        XCTAssertTrue(ConnectionStore(defaults: defaults).connections.isEmpty)
    }
}
