import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct LedraWorkActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var currentStep: String
        public var statusLabel: String
        public var progress: Int
        public var expectedEndAt: Date?

        public init(currentStep: String, statusLabel: String, progress: Int, expectedEndAt: Date?) {
            self.currentStep = currentStep
            self.statusLabel = statusLabel
            self.progress = progress
            self.expectedEndAt = expectedEndAt
        }
    }

    public var reservationId: String
    public var plate: String
    public var title: String

    public init(reservationId: String, plate: String, title: String) {
        self.reservationId = reservationId
        self.plate = plate
        self.title = title
    }
}
