import SwiftUI

struct TodayView: View {
    @StateObject private var model: TodayViewModel

    init(session: WatchSessionStore) {
        _model = StateObject(wrappedValue: TodayViewModel(session: session))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.jobs.isEmpty && !model.isLoading {
                    ContentUnavailableView("作業はありません", systemImage: "checkmark.circle")
                } else {
                    List {
                        if let current = model.jobs.first {
                            NavigationLink(value: current) {
                                CurrentJobRow(job: current)
                            }
                            .listRowBackground(Color.clear)
                        }

                        ForEach(model.jobs.dropFirst()) { job in
                            NavigationLink(value: job) {
                                QueueJobRow(job: job)
                            }
                        }
                    }
                    .listStyle(.carousel)
                }
            }
            .navigationTitle("今日の作業")
            .navigationDestination(for: WatchJob.self) { job in
                JobDetailView(job: job, model: model)
            }
            .overlay {
                if model.isLoading && model.jobs.isEmpty { ProgressView() }
            }
            .task { await model.load() }
            .refreshable { await model.load() }
            .alert("Ledra", isPresented: Binding(
                get: { model.message != nil },
                set: { if !$0 { model.message = nil } }
            )) {
                Button("閉じる", role: .cancel) { model.message = nil }
            } message: {
                Text(model.message ?? "")
            }
        }
    }
}

private struct CurrentJobRow: View {
    let job: WatchJob

    var body: some View {
        HStack(spacing: 10) {
            Gauge(value: Double(job.progress), in: 0...100) {
                Image(systemName: "wrench.and.screwdriver.fill")
            }
            .gaugeStyle(.accessoryCircular)
            .tint(LedraColors.status(job.status))
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(job.plate)
                    .font(.headline)
                    .lineLimit(1)
                Text(job.currentStep ?? job.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(job.statusLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(LedraColors.status(job.status))
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("現在の作業、\(job.plate)、\(job.statusLabel)")
    }
}

private struct QueueJobRow: View {
    let job: WatchJob

    var body: some View {
        HStack {
            Text(job.startTime ?? "--:--")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(job.plate).lineLimit(1)
                Text(job.customerName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

