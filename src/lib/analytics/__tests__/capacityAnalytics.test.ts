import { describe, it, expect } from "vitest";
import { decomposeTimeBands, computeFleetUtilization, computeStaffCapacity, type StaffJob } from "../capacityAnalytics";
import type { BoothInfo, BoothReservation } from "@/lib/booths/occupancy";
import { SHIFT_START, SHIFT_END } from "@/lib/gantt/board";

// ── ヘルパ ──

const mkBooth = (overrides?: Partial<BoothInfo>): BoothInfo => ({
  id: "booth-1",
  name: "リフト A",
  boothType: "lift",
  capacity: 1,
  isActive: true,
  ...overrides,
});

const mkRes = (overrides?: Partial<BoothReservation>): BoothReservation => ({
  id: "r-1",
  boothId: "booth-1",
  startTime: "09:00",
  endTime: "12:00",
  estimatedMinutes: 180,
  status: "confirmed",
  ...overrides,
});

// ── decomposeTimeBands ──

describe("decomposeTimeBands", () => {
  it("予約なし → 全帯が空き", () => {
    const bands = decomposeTimeBands(mkBooth({ capacity: 2 }), [], 9, 17);
    expect(bands).toEqual([{ start: 9, end: 17, concurrent: 0, capacity: 2, available: 2 }]);
  });

  it("capacity=1, 1予約 → 予約前・予約中・予約後の3帯", () => {
    const bands = decomposeTimeBands(mkBooth(), [mkRes({ startTime: "10:00", endTime: "12:00" })], 9, 17);
    expect(bands).toHaveLength(3);
    expect(bands[0]).toEqual({ start: 9, end: 10, concurrent: 0, capacity: 1, available: 1 });
    expect(bands[1]).toEqual({ start: 10, end: 12, concurrent: 1, capacity: 1, available: 0 });
    expect(bands[2]).toEqual({ start: 12, end: 17, concurrent: 0, capacity: 1, available: 1 });
  });

  it("capacity=2, 2予約重なり → 重なり部分の concurrent=2", () => {
    const booth = mkBooth({ capacity: 2 });
    const reservations = [
      mkRes({ id: "r-1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r-2", startTime: "11:00", endTime: "14:00" }),
    ];
    const bands = decomposeTimeBands(booth, reservations, 9, 17);

    // 09-11: 1, 11-12: 2, 12-14: 1, 14-17: 0
    expect(bands).toEqual([
      { start: 9, end: 11, concurrent: 1, capacity: 2, available: 1 },
      { start: 11, end: 12, concurrent: 2, capacity: 2, available: 0 },
      { start: 12, end: 14, concurrent: 1, capacity: 2, available: 1 },
      { start: 14, end: 17, concurrent: 0, capacity: 2, available: 2 },
    ]);
  });

  it("cancelled/completed/no_show は除外（occupancy.ts の NON_OCCUPYING を再利用）", () => {
    const bands = decomposeTimeBands(
      mkBooth(),
      [
        mkRes({ status: "cancelled" }),
        mkRes({ id: "r-2", status: "completed" }),
        mkRes({ id: "r-3", status: "no_show" }),
      ],
      9,
      17,
    );
    expect(bands).toEqual([{ start: 9, end: 17, concurrent: 0, capacity: 1, available: 1 }]);
  });

  it("終日予約（時間未設定）→ 全帯 concurrent=1", () => {
    const bands = decomposeTimeBands(mkBooth(), [mkRes({ startTime: null, endTime: null })], 9, 17);
    expect(bands).toEqual([{ start: 9, end: 17, concurrent: 1, capacity: 1, available: 0 }]);
  });

  it("隣接予約は重ならない（10:00-12:00 + 12:00-14:00）", () => {
    const bands = decomposeTimeBands(
      mkBooth(),
      [
        mkRes({ id: "r-1", startTime: "10:00", endTime: "12:00" }),
        mkRes({ id: "r-2", startTime: "12:00", endTime: "14:00" }),
      ],
      9,
      17,
    );
    // 同時刻は終了(-1)が先 → 12:00 で concurrent は 0→1（重ならない）
    const at12 = bands.find((b) => b.start === 12);
    expect(at12?.concurrent).toBe(1);
  });
});

// ── computeFleetUtilization ──

describe("computeFleetUtilization", () => {
  it("2ブース、各約45%稼働 → 平均45%", () => {
    const booths = [mkBooth({ id: "b1" }), mkBooth({ id: "b2" })];
    // b1: 09-14 = 5h/11h ≈ 45%, b2: 09-14 = 5h/11h ≈ 45%
    const reservations = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "14:00" }),
      mkRes({ id: "r2", boothId: "b2", startTime: "09:00", endTime: "14:00" }),
    ];
    const summary = computeFleetUtilization(booths, reservations);
    expect(summary.totalBooths).toBe(2);
    expect(summary.activeBooths).toBe(2);
    expect(summary.avgUtilizationPct).toBe(45); // 300min / 660min = 45.45 → 45
    expect(summary.totalConflicts).toBe(0);
    expect(summary.boothDetails).toHaveLength(2);
  });

  it("非アクティブブースは除外", () => {
    const booths = [mkBooth({ id: "b1" }), mkBooth({ id: "b2", isActive: false })];
    const summary = computeFleetUtilization(booths, []);
    expect(summary.totalBooths).toBe(2);
    expect(summary.activeBooths).toBe(1);
    expect(summary.boothDetails).toHaveLength(1);
  });

  it("ブースなし → 0", () => {
    const summary = computeFleetUtilization([], []);
    expect(summary.totalBooths).toBe(0);
    expect(summary.activeBooths).toBe(0);
    expect(summary.avgUtilizationPct).toBe(0);
    expect(summary.peakUtilizationPct).toBe(0);
  });

  it("定員超過をカウント", () => {
    const booth = mkBooth({ id: "b1", capacity: 1 });
    const reservations = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "11:00" }),
    ];
    const summary = computeFleetUtilization([booth], reservations);
    expect(summary.totalConflicts).toBe(1);
  });

  it("capacity>1 のブースは定員に対する割合で稼働率を出す（union だと過大評価になる）", () => {
    // capacity=3 のブースに終日1件だけ予約 → union ベースだと稼働率100%になってしまうが、
    // 実際には定員3枠中1枠しか使っていないので約33%が正しい。
    // boothDetails も同じ正規化済みの値を返す（avg/peak とだけ一致して boothDetails は
    // union ベースのまま、という矛盾を防ぐ。Codex #1009 指摘）。
    const booth = mkBooth({ id: "b1", capacity: 3 });
    const reservations = [mkRes({ id: "r1", boothId: "b1", startTime: null, endTime: null })];
    const summary = computeFleetUtilization([booth], reservations, 9, 17);
    expect(summary.avgUtilizationPct).toBe(33);
    expect(summary.peakUtilizationPct).toBe(33);
    expect(summary.boothDetails[0].utilizationPct).toBe(33);
    // occupiedMinutes/totalMinutes の比率も utilizationPct と一致する（480分の定員3枠中
    // 実効1枠分=160分だけ埋まっている、という自己無矛盾な表現）。
    expect(summary.boothDetails[0].occupiedMinutes).toBe(160);
    expect(summary.boothDetails[0].totalMinutes).toBe(480);
  });

  it("completed 予約は稼働実績に含める（boothDetails と矛盾しない）", () => {
    // decomposeTimeBands のデフォルト（NON_OCCUPYING）は completed も除外するが、
    // computeBoothUtilization は completed を稼働実績に含める。両者が食い違うと
    // 同じレスポンス内で avgUtilizationPct=0 なのに boothDetails[0].utilizationPct=100
    // という矛盾が起きる（IMP-046 delayed review で発見）。
    const booth = mkBooth({ id: "b1", capacity: 1 });
    const reservations = [mkRes({ id: "r1", boothId: "b1", startTime: null, endTime: null, status: "completed" })];
    const summary = computeFleetUtilization([booth], reservations, 9, 17);
    expect(summary.avgUtilizationPct).toBe(100);
    expect(summary.boothDetails[0].utilizationPct).toBe(100);
  });
});

// ── computeStaffCapacity ──

describe("computeStaffCapacity", () => {
  it("2スタッフの負荷を集計", () => {
    const jobs: StaffJob[] = [
      { staffId: "s1", estimatedMinutes: 120, actualMinutes: 100 },
      { staffId: "s1", estimatedMinutes: 60, actualMinutes: 80 },
      { staffId: "s2", estimatedMinutes: 180, actualMinutes: 200 },
    ];
    const result = computeStaffCapacity(jobs);
    expect(result.totalStaff).toBe(2);

    const s1 = result.staffDetails.find((s) => s.staffId === "s1")!;
    expect(s1.jobCount).toBe(2);
    expect(s1.totalEstimatedMinutes).toBe(180);
    expect(s1.totalActualMinutes).toBe(180);
    // 180min / 660min(11h) ≈ 27%
    expect(s1.loadPct).toBe(27);
    // 効率 = 180/180 = 1.0
    expect(s1.efficiencyRatio).toBe(1);

    const s2 = result.staffDetails.find((s) => s.staffId === "s2")!;
    expect(s2.jobCount).toBe(1);
    // 200min / 660min ≈ 30%
    expect(s2.loadPct).toBe(30);
    // 効率 = 180/200 = 0.9
    expect(s2.efficiencyRatio).toBe(0.9);
  });

  it("過負荷・遊休の識別", () => {
    const jobs: StaffJob[] = [
      // s1: 600min → 600/660 ≈ 91% (overloaded)
      { staffId: "s1", estimatedMinutes: 600, actualMinutes: 600 },
      // s2: 100min → 100/660 ≈ 15% (underutilized)
      { staffId: "s2", estimatedMinutes: 100, actualMinutes: 100 },
      // s3: 300min → 300/660 ≈ 45% (normal)
      { staffId: "s3", estimatedMinutes: 300, actualMinutes: 300 },
    ];
    const result = computeStaffCapacity(jobs);
    expect(result.overloadedCount).toBe(1);
    expect(result.underutilizedCount).toBe(1);
    expect(result.peakLoadPct).toBe(91);
  });

  it("ジョブなし → 空", () => {
    const result = computeStaffCapacity([]);
    expect(result.totalStaff).toBe(0);
    expect(result.avgLoadPct).toBe(0);
    expect(result.staffDetails).toEqual([]);
  });

  it("estimatedMinutes=null → 0 として扱う", () => {
    const jobs: StaffJob[] = [{ staffId: "s1", estimatedMinutes: null, actualMinutes: 120 }];
    const result = computeStaffCapacity(jobs);
    const s1 = result.staffDetails[0];
    expect(s1.totalEstimatedMinutes).toBe(0);
    expect(s1.efficiencyRatio).toBe(0); // 0/120 = 0
  });

  it("actualMinutes=0 → efficiencyRatio=null", () => {
    const jobs: StaffJob[] = [{ staffId: "s1", estimatedMinutes: 120, actualMinutes: 0 }];
    const result = computeStaffCapacity(jobs);
    expect(result.staffDetails[0].efficiencyRatio).toBeNull();
  });

  it("actualMinutes=null（未着手）は見積時間を負荷の代理値に使う", () => {
    // 見積のみで埋まった予定のスタッフが 0% 負荷と誤って報告されないことを確認。
    const jobs: StaffJob[] = [{ staffId: "s1", estimatedMinutes: 300, actualMinutes: null }];
    const result = computeStaffCapacity(jobs);
    // 300min / 660min ≈ 45%（0% ではない）
    expect(result.staffDetails[0].loadPct).toBe(45);
    // totalActualMinutes 自体は実際の実績のみを表すので 0 のまま
    expect(result.staffDetails[0].totalActualMinutes).toBe(0);
  });

  it("allStaffIds を渡すとジョブ0件のスタッフも遊休として集計される", () => {
    const jobs: StaffJob[] = [{ staffId: "s1", estimatedMinutes: 300, actualMinutes: 300 }];
    const result = computeStaffCapacity(jobs, SHIFT_START, SHIFT_END, ["s1", "s2"]);
    expect(result.totalStaff).toBe(2);
    const s2 = result.staffDetails.find((s) => s.staffId === "s2")!;
    expect(s2.jobCount).toBe(0);
    expect(s2.loadPct).toBe(0);
    expect(result.underutilizedCount).toBe(1); // s2 のみ（s1 は 300/660≈45%）
  });

  it("過負荷判定は丸め前の比率で行う（境界値の誤分類を防ぐ）", () => {
    // 530min / 660min ≈ 80.30...% → 丸めると80だが、生の比率では80より大きいので過負荷
    const jobs: StaffJob[] = [{ staffId: "s1", estimatedMinutes: 530, actualMinutes: 530 }];
    const result = computeStaffCapacity(jobs);
    expect(result.staffDetails[0].loadPct).toBe(80);
    expect(result.overloadedCount).toBe(1);
  });
});
