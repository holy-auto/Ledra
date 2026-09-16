import AppIntents
import Foundation

private enum LedraIntentError: LocalizedError {
    case notPaired
    case noCurrentJob
    case invalidMemo

    var errorDescription: String? {
        switch self {
        case .notPaired:
            return "iPhoneでLedraを開いてApple Watchを接続してください"
        case .noCurrentJob:
            return "進行中の作業がありません"
        case .invalidMemo:
            return "メモは1〜200文字で入力してください"
        }
    }
}

private func intentClient() throws -> WatchAPIClient {
    guard let baseURLText = KeychainStore.get("apiBaseURL"),
          let baseURL = URL(string: baseURLText),
          let token = KeychainStore.get("accessToken") else {
        throw LedraIntentError.notPaired
    }
    return WatchAPIClient(
        baseURL: baseURL,
        accessToken: token,
        storeID: KeychainStore.get("storeID")
    )
}

private func currentJob(using client: WatchAPIClient) async throws -> WatchJob {
    guard let job = try await client.today().jobs.first else {
        throw LedraIntentError.noCurrentJob
    }
    return job
}

struct AdvanceCurrentWorkIntent: AppIntent {
    static let title: LocalizedStringResource = "現在の工程を進める"
    static let description = IntentDescription("Ledraで優先度が最も高い作業を次の工程へ進めます。")
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let client = try intentClient()
        let job = try await currentJob(using: client)
        try await requestConfirmation()
        try await client.advance(jobID: job.id)
        return .result(dialog: "\(job.plate)を「\(job.actionLabel)」へ更新しました")
    }
}

struct AddCurrentWorkMemoIntent: AppIntent {
    static let title: LocalizedStringResource = "現在の作業にメモ"
    static let description = IntentDescription("音声で話した短いメモを現在の作業へ保存します。")
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    @Parameter(title: "メモ")
    var memo: String

    static var parameterSummary: some ParameterSummary {
        Summary("現在の作業に \(.$memo) とメモ")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = memo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 200 else {
            throw LedraIntentError.invalidMemo
        }

        let client = try intentClient()
        let job = try await currentJob(using: client)
        try await client.addMemo(jobID: job.id, memo: trimmed)
        return .result(dialog: "\(job.plate)に作業メモを保存しました")
    }
}

struct LedraAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AdvanceCurrentWorkIntent(),
            phrases: [
                "\(.applicationName)で工程を進める",
                "\(.applicationName)で次の工程",
            ],
            shortTitle: "工程を進める",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: AddCurrentWorkMemoIntent(),
            phrases: [
                "\(.applicationName)で作業メモ",
                "\(.applicationName)にメモ",
            ],
            shortTitle: "作業メモ",
            systemImageName: "mic.fill"
        )
    }
}
