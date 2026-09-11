import Foundation
import WatchConnectivity
import WatchKit

struct PhotoFeedback: Equatable {
    let id = UUID()
    let reservationID: String
    let success: Bool
    let message: String
    let count: Int?
}

@MainActor
final class WatchSessionStore: NSObject, ObservableObject {
    @Published private(set) var isPaired = false
    @Published private(set) var photoFeedback: PhotoFeedback?

    var apiBaseURL: URL? {
        guard let value = KeychainStore.get("apiBaseURL") else { return nil }
        return URL(string: value)
    }

    var accessToken: String? {
        KeychainStore.get("accessToken")
    }

    var storeID: String? {
        KeychainStore.get("storeID")
    }

    override init() {
        super.init()
        isPaired = apiBaseURL != nil && accessToken != nil
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    private func apply(_ context: [String: Any]) {
        guard let apiBaseURL = context["apiBaseURL"] as? String,
              let accessToken = context["accessToken"] as? String else { return }
        KeychainStore.set(apiBaseURL, for: "apiBaseURL")
        KeychainStore.set(accessToken, for: "accessToken")
        if let storeID = context["storeID"] as? String {
            KeychainStore.set(storeID, for: "storeID")
        }
        isPaired = true
    }

    func requestPhoto(reservationID: String, stage: String) async throws -> Bool {
        guard WCSession.isSupported() else { throw WatchAPIError.notPaired }
        let session = WCSession.default
        let message: [String: Any] = [
            "action": "open_photo",
            "reservationId": reservationID,
            "stage": stage,
        ]

        guard session.activationState == .activated, session.isReachable else {
            session.transferUserInfo(message)
            return false
        }

        return try await withCheckedThrowingContinuation { continuation in
            session.sendMessage(message) { reply in
                continuation.resume(returning: reply["opened"] as? Bool ?? false)
            } errorHandler: { error in
                continuation.resume(throwing: error)
            }
        }
    }

    func syncWorkActivities(_ jobs: [WatchJob]) {
        for job in jobs where job.status == .inProgress {
            var payload: [String: Any] = [
                "action": "sync_work_activity",
                "reservationId": job.id,
                "plate": job.plate,
                "title": job.title,
                "currentStep": job.currentStep ?? job.title,
                "statusLabel": job.statusLabel,
                "progress": job.progress,
            ]
            if let expectedEndAt = job.expectedEndAt { payload["expectedEndAt"] = expectedEndAt }
            deliver(payload)
        }
    }

    func endWorkActivity(reservationID: String) {
        deliver(["action": "end_work_activity", "reservationId": reservationID])
    }

    private func deliver(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.activationState == .activated, session.isReachable {
            session.sendMessage(payload, replyHandler: nil) { _ in
                session.transferUserInfo(payload)
            }
        } else {
            session.transferUserInfo(payload)
        }
    }

    private func handleMessage(_ payload: [String: Any]) {
        guard payload["action"] as? String == "photo_result",
              let reservationID = payload["reservationId"] as? String,
              let success = payload["success"] as? Bool,
              let message = payload["message"] as? String else { return }

        photoFeedback = PhotoFeedback(
            reservationID: reservationID,
            success: success,
            message: message,
            count: payload["count"] as? Int
        )
        WKInterfaceDevice.current().play(success ? .success : .failure)
    }
}

extension WatchSessionStore: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        guard activationState == .activated else { return }
        let context = session.receivedApplicationContext
        Task { @MainActor in self.apply(context) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.apply(applicationContext) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.handleMessage(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        Task { @MainActor in self.handleMessage(userInfo) }
    }
}
