import ExpoModulesCore
import UIKit
import UserNotifications
import WatchConnectivity

public final class LedraWatchBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("LedraWatchBridge")
        Events("onOpenPhoto")

        OnCreate {
            WatchSessionBridge.shared.onPhotoRequest = { [weak self] reservationID, stage in
                DispatchQueue.main.async {
                    if UIApplication.shared.applicationState == .active {
                        var payload: [String: Any] = ["reservationId": reservationID]
                        if let stage { payload["stage"] = stage }
                        self?.sendEvent("onOpenPhoto", payload)
                    } else {
                        WatchSessionBridge.schedulePhotoNotification(reservationID: reservationID, stage: stage)
                    }
                }
            }
        }

        AsyncFunction("sync") { (credentials: Credentials) -> Bool in
            try WatchSessionBridge.shared.sync(
                apiBaseURL: credentials.apiBaseURL,
                accessToken: credentials.accessToken,
                storeID: credentials.storeID
            )
            return true
        }

        AsyncFunction("syncWorkActivity") { (payload: WorkActivityPayload) async -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return await LedraWorkActivityManager.shared.sync(
                reservationId: payload.reservationId,
                plate: payload.plate,
                title: payload.title,
                currentStep: payload.currentStep,
                statusLabel: payload.statusLabel,
                progress: payload.progress,
                expectedEndAt: payload.expectedEndAt
            )
        }

        AsyncFunction("endWorkActivity") { (reservationID: String) async -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return await LedraWorkActivityManager.shared.end(reservationId: reservationID)
        }

        AsyncFunction("reportPhotoResult") { (payload: PhotoResultPayload) -> Bool in
            WatchSessionBridge.shared.reportPhotoResult(payload)
        }
    }
}

private struct Credentials: Record {
    @Field var apiBaseURL: String
    @Field var accessToken: String
    @Field var storeID: String?
}

private struct PhotoResultPayload: Record {
    @Field var reservationId: String
    @Field var success: Bool
    @Field var message: String
    @Field var count: Int?
}

private final class WatchSessionBridge: NSObject, WCSessionDelegate {
    static let shared = WatchSessionBridge()
    var onPhotoRequest: ((String, String?) -> Void)?

    override private init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func sync(apiBaseURL: String, accessToken: String, storeID: String?) throws {
        guard WCSession.isSupported() else { return }
        var context: [String: Any] = [
            "apiBaseURL": apiBaseURL,
            "accessToken": accessToken,
        ]
        if let storeID, !storeID.isEmpty { context["storeID"] = storeID }
        try WCSession.default.updateApplicationContext(context)
    }

    func reportPhotoResult(_ payload: PhotoResultPayload) -> Bool {
        guard WCSession.isSupported() else { return false }
        let session = WCSession.default
        var message: [String: Any] = [
            "action": "photo_result",
            "reservationId": payload.reservationId,
            "success": payload.success,
            "message": payload.message,
        ]
        if let count = payload.count { message["count"] = count }

        if session.activationState == .activated, session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in
                session.transferUserInfo(message)
            }
            return true
        }

        session.transferUserInfo(message)
        return false
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        DispatchQueue.main.async {
            let handled = self.handle(message)
            replyHandler(["opened": handled && UIApplication.shared.applicationState == .active])
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            _ = self.handle(message)
        }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        DispatchQueue.main.async {
            _ = self.handle(userInfo)
        }
    }

    private func handle(_ payload: [String: Any]) -> Bool {
        guard let action = payload["action"] as? String,
              let reservationID = payload["reservationId"] as? String,
              !reservationID.isEmpty else { return false }

        switch action {
        case "open_photo":
            let rawStage = payload["stage"] as? String
            let stage = ["intake_before", "in_progress", "after"].contains(rawStage ?? "") ? rawStage : nil
            onPhotoRequest?(reservationID, stage)
            return true
        case "sync_work_activity":
            guard let plate = payload["plate"] as? String,
                  let title = payload["title"] as? String,
                  let currentStep = payload["currentStep"] as? String,
                  let statusLabel = payload["statusLabel"] as? String,
                  let progress = payload["progress"] as? Int else { return false }
            let expectedEndAt = payload["expectedEndAt"] as? String
            if #available(iOS 16.2, *) {
                Task {
                    _ = await LedraWorkActivityManager.shared.sync(
                        reservationId: reservationID,
                        plate: plate,
                        title: title,
                        currentStep: currentStep,
                        statusLabel: statusLabel,
                        progress: progress,
                        expectedEndAt: expectedEndAt
                    )
                }
            }
            return true
        case "end_work_activity":
            if #available(iOS 16.2, *) {
                Task { _ = await LedraWorkActivityManager.shared.end(reservationId: reservationID) }
            }
            return true
        default:
            return false
        }
    }

    static func schedulePhotoNotification(reservationID: String, stage: String?) {
        let content = UNMutableNotificationContent()
        content.title = "施工写真を撮影"
        content.body = "タップしてLedraの撮影画面を開きます"
        content.sound = .default
        let suffix = stage.map { "&photoStage=\($0)" } ?? ""
        content.userInfo = [
            "route": "/work/\(reservationID)?openPhotos=1\(suffix)",
            "reservationId": reservationID,
        ]
        let request = UNNotificationRequest(
            identifier: "watch.photo.\(reservationID)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
