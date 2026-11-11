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
        for host in ["link.mew.run", "mew.run", "mew.saens.kr"] {
            let connection = try SavedConnection(name: "Laptop", kind: .mewlink, address: "https://\(host)/alice/laptop/")
            XCTAssertEqual(connection.address.absoluteString, "https://link.mew.run/alice/laptop")
            XCTAssertEqual(connection.origin, "https://link.mew.run")
        }
        XCTAssertEqual(try SavedConnection(name: "Default port", kind: .direct, address: "https://example.com:443").origin, "https://example.com")
        for address in ["https://evil.com/alice/laptop", "https://app.mew.run/launch/id", "http://link.mew.run/alice/laptop", "https://link.mew.run/alice", "https://link.mew.run/alice/laptop/api", "https://link.mew.run:444/alice/laptop", "https://mew.run.evil.com/alice/laptop", "https://user:secret@link.mew.run/alice/laptop", "https://link.mew.run/alice/laptop?token=secret", "https://mew.saens.kr/alice/laptop#secret"] {
            XCTAssertThrowsError(try SavedConnection(name: "test", kind: .mewlink, address: address))
        }
    }

    func testMewlinkNavigationStaysOnCanonicalDeviceAddress() throws {
        let connection = try SavedConnection(name: "Laptop", kind: .mewlink, address: "https://mew.run/alice/laptop")
        XCTAssertTrue(connection.acceptsMewlinkNavigation(URL(string: "https://link.mew.run/alice/laptop")!))
        XCTAssertTrue(connection.acceptsMewlinkNavigation(URL(string: "https://link.mew.run:443/alice/laptop")!))
        for address in ["http://link.mew.run/alice/laptop", "https://mew.run/alice/laptop", "https://mew.saens.kr/alice/laptop", "https://app.mew.run/launch/id", "https://link.mew.run/bob/laptop", "https://link.mew.run/alice/other", "https://link.mew.run/alice/laptop/api", "https://link.mew.run:444/alice/laptop", "https://user:secret@link.mew.run/alice/laptop", "https://link.mew.run.evil.com/alice/laptop"] {
            XCTAssertFalse(connection.acceptsMewlinkNavigation(URL(string: address)!))
        }
        let direct = try SavedConnection(name: "Direct", kind: .direct, address: "https://link.mew.run")
        XCTAssertFalse(direct.acceptsMewlinkNavigation(connection.address))
    }

    @MainActor func testStoreMigratesLegacyMewlinkURLsWithoutChangingConnectionIdentity() throws {
        let suite = "MewTests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let identifiers = [UUID(), UUID()]
        let saved = zip(identifiers, ["mew.run", "mew.saens.kr"]).map { id, host in
            ["id": id.uuidString, "name": "Laptop", "kind": "mewlink", "address": "https://\(host)/alice/laptop", "allowsLocalHTTP": false] as [String: Any]
        }
        defaults.set(try JSONSerialization.data(withJSONObject: saved), forKey: "mew.saved-connections.v1")
        let store = ConnectionStore(defaults: defaults)
        XCTAssertEqual(store.connections.map(\.id), identifiers)
        XCTAssertEqual(store.connections.map(\.name), ["Laptop", "Laptop"])
        XCTAssertTrue(store.connections.allSatisfy { $0.address.absoluteString == "https://link.mew.run/alice/laptop" })
        let persisted = try JSONSerialization.jsonObject(with: defaults.data(forKey: "mew.saved-connections.v1")!) as! [[String: Any]]
        XCTAssertTrue(persisted.allSatisfy { $0["address"] as? String == "https://link.mew.run/alice/laptop" })
        XCTAssertEqual(ConnectionStore(defaults: defaults).connections, store.connections)
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
