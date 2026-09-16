import ActivityKit
import LedraWatchBridge
import SwiftUI
import WidgetKit

struct LedraWorkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LedraWorkActivityAttributes.self) { context in
            LockScreenWorkView(context: context)
                .activityBackgroundTint(Color(red: 13 / 255, green: 25 / 255, blue: 43 / 255))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ProgressMark(progress: context.state.progress)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.plate).font(.headline)
                        Text(context.state.currentStep).font(.caption).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RemainingTime(date: context.state.expectedEndAt)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.statusLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.cyan)
                }
            } compactLeading: {
                Image(systemName: "wrench.and.screwdriver.fill").foregroundStyle(.cyan)
            } compactTrailing: {
                Text("\(context.state.progress)%").font(.caption2.monospacedDigit())
            } minimal: {
                ProgressMark(progress: context.state.progress)
            }
            .widgetURL(URL(string: "ledra://work/\(context.attributes.reservationId)"))
            .keylineTint(.cyan)
        }
    }
}

private struct LockScreenWorkView: View {
    let context: ActivityViewContext<LedraWorkActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            ProgressMark(progress: context.state.progress)
            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.plate).font(.headline).lineLimit(1)
                Text(context.state.currentStep).font(.subheadline).lineLimit(1)
                Text(context.state.statusLabel).font(.caption).foregroundStyle(.cyan)
            }
            Spacer(minLength: 8)
            RemainingTime(date: context.state.expectedEndAt)
        }
        .padding(.horizontal, 4)
        .foregroundStyle(.white)
        .widgetURL(URL(string: "ledra://work/\(context.attributes.reservationId)"))
    }
}

private struct ProgressMark: View {
    let progress: Int

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.2), lineWidth: 4)
            Circle()
                .trim(from: 0, to: Double(progress) / 100)
                .stroke(.cyan, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(progress)").font(.caption2.bold().monospacedDigit())
        }
        .frame(width: 42, height: 42)
        .accessibilityLabel("進捗\(progress)パーセント")
    }
}

private struct RemainingTime: View {
    let date: Date?

    var body: some View {
        if let date {
            VStack(alignment: .trailing, spacing: 1) {
                Text("予定まで").font(.caption2).foregroundStyle(.secondary)
                Text(timerInterval: Date()...max(Date(), date), countsDown: true)
                    .font(.caption.bold().monospacedDigit())
            }
        } else {
            Image(systemName: "chevron.right").foregroundStyle(.secondary)
        }
    }
}

@main
struct LedraLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        LedraWorkLiveActivity()
    }
}
