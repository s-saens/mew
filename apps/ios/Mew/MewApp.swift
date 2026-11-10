import SwiftUI

@main
@MainActor
struct MewApp: App {
    @StateObject private var store = ConnectionStore()
    @StateObject private var notifications = NativeNotifications()
    @State private var cache: NativeAssetCache?
    @State private var storageFailed = false

    var body: some Scene {
        WindowGroup {
            Group {
                if let cache {
                    ConnectionsView(cache: cache)
                        .environmentObject(store)
                        .environmentObject(notifications)
                } else if storageFailed {
                    VStack(spacing: 16) {
                        Image(systemName: "externaldrive.badge.exclamationmark").font(.largeTitle)
                        Text("Mew could not open its local storage.")
                        Button("Try again", action: openStorage)
                    }.padding()
                } else { ProgressView().task { openStorage() } }
            }
            .preferredColorScheme(.dark)
        }
    }

    private func openStorage() {
        do { cache = try NativeAssetCache(); storageFailed = false }
        catch { storageFailed = true }
    }
}
