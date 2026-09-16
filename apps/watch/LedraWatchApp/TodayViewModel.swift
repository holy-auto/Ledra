import Foundation

@MainActor
final class TodayViewModel: ObservableObject {
    @Published private(set) var jobs: [WatchJob] = []
    @Published private(set) var isLoading = false
    @Published private(set) var actingJobID: String?
    @Published var message: String?

    private let session: WatchSessionStore

    init(session: WatchSessionStore) {
        self.session = session
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            jobs = try await client().today().jobs
            cache(jobs)
            session.syncWorkActivities(jobs)
            await WatchNotificationCoordinator.shared.scheduleOverdueNotifications(for: jobs)
            message = nil
        } catch {
            if jobs.isEmpty { jobs = cachedJobs() }
            message = error.localizedDescription
        }
    }

    func addMemo(_ memo: String, to job: WatchJob) async -> Bool {
        let trimmed = memo.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 200 else {
            message = "メモは1〜200文字で入力してください"
            return false
        }
        do {
            try await client().addMemo(jobID: job.id, memo: trimmed)
            message = "作業メモを保存しました"
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func requestPhoto(for job: WatchJob, stage: String) async {
        do {
            let opened = try await session.requestPhoto(reservationID: job.id, stage: stage)
            message = opened ? "iPhoneで撮影画面を開きました" : "iPhoneに撮影通知を送りました"
        } catch {
            message = error.localizedDescription
        }
    }

    func advance(_ job: WatchJob) async {
        guard actingJobID == nil else { return }
        actingJobID = job.id
        defer { actingJobID = nil }
        do {
            try await client().advance(jobID: job.id)
            message = "更新しました"
            jobs = try await client().today().jobs
            cache(jobs)
            if jobs.contains(where: { $0.id == job.id }) {
                session.syncWorkActivities(jobs)
            } else {
                session.endWorkActivity(reservationID: job.id)
            }
            await WatchNotificationCoordinator.shared.scheduleOverdueNotifications(for: jobs)
        } catch {
            message = error.localizedDescription
        }
    }

    private func client() throws -> WatchAPIClient {
        guard let baseURL = session.apiBaseURL, let token = session.accessToken else {
            throw WatchAPIError.notPaired
        }
        return WatchAPIClient(baseURL: baseURL, accessToken: token, storeID: session.storeID)
    }

    private func cache(_ jobs: [WatchJob]) {
        guard let data = try? JSONEncoder().encode(jobs) else { return }
        UserDefaults.standard.set(data, forKey: "watch.today.jobs")
    }

    private func cachedJobs() -> [WatchJob] {
        guard let data = UserDefaults.standard.data(forKey: "watch.today.jobs") else { return [] }
        return (try? JSONDecoder().decode([WatchJob].self, from: data)) ?? []
    }
}
