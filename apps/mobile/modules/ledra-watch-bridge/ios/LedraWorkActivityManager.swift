import ActivityKit
import ExpoModulesCore
import Foundation

struct WorkActivityPayload: Record {
    @Field var reservationId: String
    @Field var plate: String
    @Field var title: String
    @Field var currentStep: String
    @Field var statusLabel: String
    @Field var progress: Int
    @Field var expectedEndAt: String?
}

@available(iOS 16.2, *)
actor LedraWorkActivityManager {
    static let shared = LedraWorkActivityManager()

    func sync(
        reservationId: String,
        plate: String,
        title: String,
        currentStep: String,
        statusLabel: String,
        progress: Int,
        expectedEndAt: String?
    ) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

        let state = LedraWorkActivityAttributes.ContentState(
            currentStep: currentStep,
            statusLabel: statusLabel,
            progress: min(100, max(0, progress)),
            expectedEndAt: parseISO8601(expectedEndAt)
        )
        let content = ActivityContent(state: state, staleDate: parseISO8601(expectedEndAt))

        if let existing = activity(for: reservationId) {
            await existing.update(content)
            return true
        }

        do {
            let attributes = LedraWorkActivityAttributes(
                reservationId: reservationId,
                plate: plate,
                title: title
            )
            _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
            return true
        } catch {
            return false
        }
    }

    func end(reservationId: String) async -> Bool {
        guard let existing = activity(for: reservationId) else { return true }
        await existing.end(nil, dismissalPolicy: .immediate)
        return true
    }

    private func activity(for reservationId: String) -> Activity<LedraWorkActivityAttributes>? {
        Activity<LedraWorkActivityAttributes>.activities.first {
            $0.attributes.reservationId == reservationId
        }
    }

    private func parseISO8601(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
