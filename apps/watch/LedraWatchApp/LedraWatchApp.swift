import SwiftUI

@main
struct LedraWatchApp: App {
    @StateObject private var session = WatchSessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(LedraColors.blue)
        }
    }
}

