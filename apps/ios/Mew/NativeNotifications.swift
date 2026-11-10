import Foundation
import UserNotifications
import Combine

struct NativeNotificationAction: Equatable {
    let connectionID: UUID
    let id: String
    let nonce = UUID()
}

@MainActor
final class NativeNotifications: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published private(set) var clicked: NativeNotificationAction?
    private let center: UNUserNotificationCenter

    override init() {
        center = .current()
        super.init()
        center.delegate = self
    }

    func permission() async -> String {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "default"
        @unknown default: return "denied"
        }
    }

    func request() async throws -> String {
        _ = try await center.requestAuthorization(options: [.alert, .badge, .sound])
        return await permission()
    }

    func show(connectionID: UUID, id: String, title: String, body: String) async throws {
        guard !id.isEmpty, id.utf8.count <= 200, title.utf8.count <= 500, body.utf8.count <= 4000,
              await permission() == "granted" else { throw NativeCacheError.invalidRequest }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["connectionID": connectionID.uuidString, "id": id]
        try await center.add(UNNotificationRequest(identifier: identifier(connectionID, id), content: content, trigger: nil))
    }

    func close(connectionID: UUID, id: String) {
        let key = identifier(connectionID, id)
        center.removePendingNotificationRequests(withIdentifiers: [key])
        center.removeDeliveredNotifications(withIdentifiers: [key])
    }

    func closeAll(connectionID: UUID) async {
        let prefix = connectionID.uuidString + ":"
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
        let delivered = await center.deliveredNotifications().map { $0.request.identifier }.filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        center.removeDeliveredNotifications(withIdentifiers: delivered)
    }

    private func identifier(_ connectionID: UUID, _ id: String) -> String {
        connectionID.uuidString + ":" + NativeAssetCache.digest(Data(id.utf8))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if let value = info["connectionID"] as? String, let connectionID = UUID(uuidString: value), let id = info["id"] as? String {
            Task { @MainActor in self.clicked = NativeNotificationAction(connectionID: connectionID, id: id) }
        }
        completionHandler()
    }
}
