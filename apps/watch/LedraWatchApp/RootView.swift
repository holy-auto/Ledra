import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: WatchSessionStore

    var body: some View {
        Group {
            if session.isPaired {
                TodayView(session: session)
            } else {
                PairingView()
            }
        }
        .background(Color.black)
    }
}

private struct PairingView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(LedraColors.blue)
            Text("iPhoneで接続")
                .font(.headline)
            Text("Ledraを開くと、このWatchにログイン情報が届きます")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

