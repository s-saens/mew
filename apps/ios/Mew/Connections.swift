import Foundation
import Combine
import Darwin

enum ConnectionKind: String, Codable, CaseIterable, Hashable {
    case direct, mewlink
}

enum ConnectionError: LocalizedError {
    case invalidAddress, insecureAddress, invalidMewlink

    var errorDescription: String? {
        switch self {
        case .invalidAddress: return String(localized: "Enter a server address without credentials, query parameters, or a fragment.")
        case .insecureAddress: return String(localized: "Use HTTPS, or explicitly allow HTTP for a private network address.")
        case .invalidMewlink: return String(localized: "Enter a Mewlink device address: https://mew.run/username/device.")
        }
    }
}

struct SavedConnection: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    let kind: ConnectionKind
    let address: URL
    let allowsLocalHTTP: Bool

    init(id: UUID = UUID(), name: String, kind: ConnectionKind, address: String, allowsLocalHTTP: Bool = false) throws {
        guard var components = URLComponents(string: address.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = components.scheme?.lowercased(), let host = components.host?.lowercased(),
              !host.isEmpty, components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.port.map({ (1...65535).contains($0) }) ?? true else { throw ConnectionError.invalidAddress }
        components.scheme = scheme
        components.host = host
        if (scheme == "https" && components.port == 443) || (scheme == "http" && components.port == 80) { components.port = nil }
        if kind == .mewlink {
            guard scheme == "https", host == "mew.run", components.port == nil,
                  components.path.range(of: #"^/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/?$"#, options: .regularExpression) != nil
            else { throw ConnectionError.invalidMewlink }
            if components.path.hasSuffix("/") { components.path.removeLast() }
        } else {
            guard components.path.isEmpty || components.path == "/" else { throw ConnectionError.invalidAddress }
            guard scheme == "https" || (scheme == "http" && allowsLocalHTTP && Self.isPrivateHost(host))
            else { throw ConnectionError.insecureAddress }
            components.path = "/"
        }
        guard let url = components.url else { throw ConnectionError.invalidAddress }
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? host : String(name.prefix(100))
        self.kind = kind
        self.address = url
        self.allowsLocalHTTP = kind == .direct && scheme == "http"
    }

    var origin: String {
        var components = URLComponents()
        components.scheme = address.scheme
        components.host = address.host
        components.port = address.port
        return components.string!
    }

    var namespace: String { kind.rawValue + ":" + address.absoluteString }

    static func isPrivateHost(_ host: String) -> Bool {
        let value = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]")).lowercased()
        if value == "localhost" || value == "::1" || value.hasSuffix(".local") || value.hasSuffix(".ts.net") { return true }
        if value.contains(":") {
            var address = in6_addr()
            guard inet_pton(AF_INET6, value, &address) == 1 else { return false }
            let bytes = withUnsafeBytes(of: &address) { Array($0) }
            return bytes[0] & 0xfe == 0xfc || (bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80)
        }
        let rawParts = value.split(separator: ".", omittingEmptySubsequences: false)
        let parts = rawParts.compactMap { Int($0) }
        guard rawParts.count == 4, parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }),
              zip(rawParts, parts).allSatisfy({ String($0.0) == String($0.1) }) else { return false }
        return parts[0] == 10 || parts[0] == 127 || (parts[0] == 192 && parts[1] == 168)
            || (parts[0] == 172 && (16...31).contains(parts[1]))
            || (parts[0] == 100 && (64...127).contains(parts[1]))
    }
}

@MainActor
final class ConnectionStore: ObservableObject {
    @Published private(set) var connections: [SavedConnection] = []
    private let defaults: UserDefaults
    private static let key = "mew.saved-connections.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.key), let saved = try? JSONDecoder().decode([SavedConnection].self, from: data) {
            connections = saved.compactMap { try? SavedConnection(id: $0.id, name: $0.name, kind: $0.kind,
                address: $0.address.absoluteString, allowsLocalHTTP: $0.allowsLocalHTTP) }
        }
    }

    func save(_ connection: SavedConnection) {
        if let index = connections.firstIndex(where: { $0.id == connection.id }) { connections[index] = connection }
        else { connections.append(connection) }
        persist()
    }

    func remove(at offsets: IndexSet) {
        for index in offsets.sorted(by: >) { connections.remove(at: index) }
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(connections) { defaults.set(data, forKey: Self.key) }
    }
}
