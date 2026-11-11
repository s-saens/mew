import SwiftUI

@MainActor
struct ConnectionsView: View {
    let cache: NativeAssetCache
    @EnvironmentObject private var store: ConnectionStore
    @EnvironmentObject private var notifications: NativeNotifications
    @State private var path: [SavedConnection] = []
    @State private var adding = false
    @State private var editing: SavedConnection?
    @State private var notificationError = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if store.connections.isEmpty {
                    Text("Add your Mew server or a Mewlink device to connect.")
                        .foregroundStyle(.secondary)
                }
                ForEach(store.connections) { connection in
                    NavigationLink(value: connection) {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(connection.name)
                                Text(connection.address.absoluteString).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        } icon: { Image(systemName: connection.kind == .mewlink ? "link" : "network") }
                    }
                    .swipeActions(edge: .leading) {
                        Button { editing = connection } label: { Label("Edit", systemImage: "pencil") }.tint(.blue)
                    }
                    .contextMenu {
                        Button { editing = connection } label: { Label("Edit", systemImage: "pencil") }
                        Button {
                            Task { try? await cache.clear(namespace: connection.namespace) }
                        } label: { Label("Clear downloaded code", systemImage: "trash") }
                    }
                }.onDelete(perform: store.remove)
                Section {
                    Button {
                        Task {
                            do { _ = try await notifications.request() }
                            catch { notificationError = true }
                        }
                    } label: { Label("Allow notifications", systemImage: "bell") }
                } footer: {
                    Text("Notifications are available while Mew is running. Push notifications when the app is closed are not available yet.")
                }
            }
            .navigationTitle("Mew")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add connection")
                }
            }
            .navigationDestination(for: SavedConnection.self) { connection in
                WorkspaceView(connection: connection, cache: cache, notifications: notifications)
            }
            .sheet(isPresented: $adding) { ConnectionEditor(connection: nil) }
            .sheet(item: $editing) { ConnectionEditor(connection: $0) }
            .alert("Could not enable notifications", isPresented: $notificationError) { Button("OK", role: .cancel) {} }
            .onChange(of: notifications.clicked) { action in
                guard let action, let connection = store.connections.first(where: { $0.id == action.connectionID }) else { return }
                if path.last?.id != connection.id { path = [connection] }
            }
        }
    }
}

@MainActor
private struct ConnectionEditor: View {
    let connection: SavedConnection?
    @EnvironmentObject private var store: ConnectionStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var address = ""
    @State private var kind = ConnectionKind.direct
    @State private var allowsHTTP = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Connection", selection: $kind) {
                    Text("Direct").tag(ConnectionKind.direct)
                    Text("Mewlink").tag(ConnectionKind.mewlink)
                }.pickerStyle(.segmented)
                TextField("Name", text: $name)
                TextField(kind == .mewlink ? "https://link.mew.run/username/device" : "https://your-server", text: $address)
                    .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                if kind == .direct {
                    Toggle("Allow HTTP on a private network", isOn: $allowsHTTP)
                    Text("Use HTTPS for tunnels. Tailscale and local network addresses can use HTTP if you allow it.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
            }
            .navigationTitle(LocalizedStringKey(connection == nil ? "Add connection" : "Edit connection"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        do {
                            store.save(try SavedConnection(id: connection?.id ?? UUID(), name: name, kind: kind, address: address, allowsLocalHTTP: allowsHTTP))
                            dismiss()
                        } catch { self.error = error.localizedDescription }
                    }.disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                if let connection {
                    name = connection.name; address = connection.address.absoluteString
                    kind = connection.kind; allowsHTTP = connection.allowsLocalHTTP
                }
            }
        }
    }
}
