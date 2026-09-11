import SwiftUI

struct JobDetailView: View {
    @EnvironmentObject private var session: WatchSessionStore
    let job: WatchJob
    @ObservedObject var model: TodayViewModel
    @State private var confirmCompletion = false
    @State private var memo = ""
    @State private var showMemo = false
    @State private var choosePhotoStage = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(job.statusLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LedraColors.status(job.status))
                    Spacer()
                    Text(job.startTime ?? "--:--")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                Text(job.plate)
                    .font(.title3.weight(.bold))
                    .minimumScaleFactor(0.75)
                    .lineLimit(1)

                Text(job.vehicleLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(job.customerName)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let step = job.currentStep {
                    Label(step, systemImage: "wrench.and.screwdriver")
                        .font(.caption)
                        .lineLimit(2)
                }

                if job.isOverdue {
                    Label("予定より\(job.overdueMinutes)分超過", systemImage: "exclamationmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LedraColors.amber)
                }

                Button {
                    if job.requiresConfirmation {
                        confirmCompletion = true
                    } else {
                        Task { await model.advance(job) }
                    }
                } label: {
                    HStack {
                        if model.actingJobID == job.id {
                            ProgressView()
                        } else {
                            Image(systemName: "checkmark")
                        }
                        Text(job.actionLabel)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.actingJobID != nil)
                .accessibilityHint("案件の状態を1段階進めます")

                Button {
                    showMemo = true
                } label: {
                    Label("音声メモ", systemImage: "mic.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    choosePhotoStage = true
                } label: {
                    Label("写真を撮る", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle("作業")
        .confirmationDialog("この作業を完了しますか？", isPresented: $confirmCompletion) {
            Button("作業完了", role: .destructive) {
                Task { await model.advance(job) }
            }
            Button("キャンセル", role: .cancel) {}
        }
        .confirmationDialog("写真の種類を選択", isPresented: $choosePhotoStage) {
            Button("施工前") {
                Task { await model.requestPhoto(for: job, stage: "intake_before") }
            }
            Button("作業中") {
                Task { await model.requestPhoto(for: job, stage: "in_progress") }
            }
            Button("施工後") {
                Task { await model.requestPhoto(for: job, stage: "after") }
            }
            Button("キャンセル", role: .cancel) {}
        }
        .sheet(isPresented: $showMemo) {
            NavigationStack {
                VStack(spacing: 10) {
                    TextField("短い作業メモ", text: $memo, axis: .vertical)
                        .lineLimit(2...4)
                    Text("マイクを選ぶと音声入力できます")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Button("保存") {
                        Task {
                            if await model.addMemo(memo, to: job) {
                                memo = ""
                                showMemo = false
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(memo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
                .navigationTitle("作業メモ")
            }
        }
        .onChange(of: session.photoFeedback) { _, feedback in
            guard let feedback, feedback.reservationID == job.id else { return }
            model.message = feedback.message
        }
    }
}
