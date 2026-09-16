import Foundation
import UserNotifications

actor WatchNotificationCoordinator {
    static let shared = WatchNotificationCoordinator()

    private let center = UNUserNotificationCenter.current()

    func configure() async {
        let open = UNNotificationAction(identifier: "OPEN_JOB", title: "作業を見る")
        let overdue = UNNotificationCategory(
            identifier: "JOB_OVERDUE",
            actions: [open],
            intentIdentifiers: []
        )
        center.setNotificationCategories([overdue])
        _ = try? await center.requestAuthorization(options: [.alert, .sound])
    }

    func scheduleOverdueNotifications(for jobs: [WatchJob]) async {
        await configure()
        let activeIDs = Set(jobs.compactMap { job in
            job.expectedEndAt == nil ? nil : "overdue.\(job.id)"
        })
        let pending = await center.pendingNotificationRequests()
        let stale = pending.map(\.identifier).filter { $0.hasPrefix("overdue.") && !activeIDs.contains($0) }
        center.removePendingNotificationRequests(withIdentifiers: stale)

        for job in jobs {
            guard let iso = job.expectedEndAt,
                  let deadline = parseISO8601(iso) else { continue }
            let markerKey = "overdue.marker.\(job.id)"
            if UserDefaults.standard.string(forKey: markerKey) == iso { continue }

            let content = UNMutableNotificationContent()
            content.title = "工程の予定時間を超えました"
            content.body = "\(job.plate)・\(job.currentStep ?? job.title)"
            content.sound = .default
            content.categoryIdentifier = "JOB_OVERDUE"
            content.userInfo = ["reservationId": job.id]

            let delay = max(1, deadline.timeIntervalSinceNow)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
            try? await center.add(UNNotificationRequest(
                identifier: "overdue.\(job.id)",
                content: content,
                trigger: trigger
            ))
            UserDefaults.standard.set(iso, forKey: markerKey)
        }
    }

    private func parseISO8601(_ value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        return ISO8601DateFormatter().date(from: value)
    }
}
