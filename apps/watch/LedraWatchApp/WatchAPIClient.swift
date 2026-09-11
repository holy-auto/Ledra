import Foundation

enum WatchAPIError: LocalizedError {
    case notPaired
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notPaired: return "iPhoneのLedraを開いて接続してください"
        case .invalidResponse: return "サーバーの応答を確認できませんでした"
        case .server(let message): return message
        }
    }
}

struct WatchAPIClient {
    let baseURL: URL
    let accessToken: String
    let storeID: String?

    func today() async throws -> TodayResponse {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/watch/today"),
            resolvingAgainstBaseURL: false
        )
        if let storeID, !storeID.isEmpty {
            components?.queryItems = [URLQueryItem(name: "store_id", value: storeID)]
        }
        guard let url = components?.url else { throw WatchAPIError.invalidResponse }
        return try await request(url: url, method: "GET", body: nil)
    }

    func advance(jobID: String) async throws {
        let url = baseURL.appendingPathComponent("api/mobile/reservations/\(jobID)/advance")
        let _: AdvanceResponse = try await request(url: url, method: "POST", body: Data("{}".utf8))
    }

    func addMemo(jobID: String, memo: String) async throws {
        let url = baseURL.appendingPathComponent("api/mobile/progress/\(jobID)")
        let body = try JSONSerialization.data(withJSONObject: [
            "progress_label": "作業メモ",
            "note": memo,
        ])
        let _: MemoResponse = try await request(url: url, method: "POST", body: body)
    }

    private func request<T: Decodable>(url: URL, method: String, body: Data?) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 15
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WatchAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIErrorResponse.self, from: data).message)
                ?? "更新できませんでした"
            throw WatchAPIError.server(message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
