import Foundation
import SwiftUI

struct TodayResponse: Decodable {
    let ok: Bool
    let date: String
    let jobs: [WatchJob]
}

struct AdvanceResponse: Decodable {
    let ok: Bool
}

struct MemoResponse: Decodable {
    let ok: Bool
}

struct APIErrorResponse: Decodable {
    let message: String?
}

struct WatchJob: Codable, Identifiable, Equatable, Hashable {
    enum Status: String, Codable, Hashable {
        case confirmed
        case arrived
        case inProgress = "in_progress"
    }

    let id: String
    let title: String
    let scheduledDate: String
    let startTime: String?
    let status: Status
    let statusLabel: String
    let customerName: String
    let vehicleLabel: String
    let plate: String
    let currentStep: String?
    let progress: Int
    let actionLabel: String
    let expectedEndAt: String?
    let overdueMinutes: Int

    var requiresConfirmation: Bool {
        actionLabel == "作業完了"
    }

    var isOverdue: Bool { overdueMinutes > 0 }
}

enum LedraColors {
    static let blue = Color(red: 21 / 255, green: 94 / 255, blue: 239 / 255)
    static let amber = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
    static let green = Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255)

    static func status(_ status: WatchJob.Status) -> Color {
        switch status {
        case .confirmed: return blue
        case .arrived: return amber
        case .inProgress: return green
        }
    }
}
