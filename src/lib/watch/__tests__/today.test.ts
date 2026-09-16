import { describe, expect, it } from "vitest";
import { toWatchJob, type WatchReservationRow } from "../today";

function row(overrides: Partial<WatchReservationRow> = {}): WatchReservationRow {
  return {
    id: "reservation-1",
    title: "コーティング",
    scheduled_date: "2026-09-11",
    start_time: "09:30:00",
    status: "arrived",
    workflow_template_id: null,
    current_step_key: null,
    current_step_order: null,
    progress_pct: null,
    workflow_templates: null,
    reservation_step_logs: [],
    customers: { name: "山田 太郎" },
    vehicles: { maker: "トヨタ", model: "プリウス", plate_display: "品川 300 あ 12-34" },
    ...overrides,
  };
}

describe("toWatchJob", () => {
  it("腕時計に必要な表示情報と次アクションへ縮約する", () => {
    expect(toWatchJob(row())).toEqual({
      id: "reservation-1",
      title: "コーティング",
      scheduledDate: "2026-09-11",
      startTime: "09:30",
      status: "arrived",
      statusLabel: "来店",
      customerName: "山田 太郎",
      vehicleLabel: "トヨタ プリウス",
      plate: "品川 300 あ 12-34",
      currentStep: null,
      progress: 0,
      actionLabel: "作業開始",
      expectedEndAt: null,
      overdueMinutes: 0,
    });
  });

  it("テンプレート工程は汎用の次工程アクションにする", () => {
    expect(
      toWatchJob(
        row({
          status: "in_progress",
          workflow_template_id: "template-1",
          workflow_templates: {
            steps: [
              { order: 1, key: "wash", label: "洗車", estimated_min: 30 },
              { order: 2, key: "coat", label: "施工", estimated_min: 60 },
            ],
          },
          current_step_key: "wash",
          current_step_order: 1,
          progress_pct: 125,
        }),
      ),
    ).toMatchObject({ actionLabel: "次の工程へ", currentStep: "洗車", progress: 100 });
  });

  it("工程の予定終了と超過分数を計算する", () => {
    const job = toWatchJob(
      row({
        status: "in_progress",
        workflow_template_id: "template-1",
        workflow_templates: { steps: [{ order: 2, key: "polish", label: "磨き", estimated_min: 30 }] },
        current_step_order: 2,
        reservation_step_logs: [
          {
            step_order: 2,
            step_label: "磨き",
            started_at: "2026-09-12T00:00:00.000Z",
            completed_at: null,
          },
        ],
      }),
      new Date("2026-09-12T00:42:00.000Z"),
    );

    expect(job).toMatchObject({
      currentStep: "磨き",
      expectedEndAt: "2026-09-12T00:30:00.000Z",
      overdueMinutes: 12,
      actionLabel: "作業完了",
    });
  });

  it("完了・キャンセル済みはWatchの作業一覧に含めない", () => {
    expect(toWatchJob(row({ status: "completed" }))).toBeNull();
    expect(toWatchJob(row({ status: "cancelled" }))).toBeNull();
  });

  it("関連データ欠損時も短い代替表示を返す", () => {
    expect(toWatchJob(row({ title: null, customers: [], vehicles: null }))).toMatchObject({
      title: "作業",
      customerName: "顧客未登録",
      vehicleLabel: "車両未登録",
      plate: "ナンバー未登録",
    });
  });
});
