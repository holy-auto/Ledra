import { describe, it, expect } from "vitest";
import {
  peakConcurrent,
  computeBoothUtilization,
  detectCapacityConflicts,
  predictBoothFreeAt,
  findAvailableBooths,
  type BoothReservation,
  type BoothInfo,
} from "../occupancy";

// ── テストヘルパ ──

const mkRes = (overrides: Partial<BoothReservation> & { id: string }): BoothReservation => ({
  boothId: "b1",
  startTime: null,
  endTime: null,
  estimatedMinutes: null,
  status: "confirmed",
  ...overrides,
});

const mkBooth = (overrides?: Partial<BoothInfo>): BoothInfo => ({
  id: "b1",
  name: "ピット1",
  boothType: "coating",
  capacity: 1,
  isActive: true,
  ...overrides,
});

// ── peakConcurrent ──

describe("peakConcurrent", () => {
  it("空配列 → 0", () => {
    expect(peakConcurrent([])).toBe(0);
  });

  it("重ならない予約 → 1", () => {
    const res = [
      mkRes({ id: "r1", startTime: "09:00", endTime: "11:00" }),
      mkRes({ id: "r2", startTime: "13:00", endTime: "15:00" }),
    ];
    expect(peakConcurrent(res)).toBe(1);
  });

  it("重なる予約 → 2", () => {
    const res = [
      mkRes({ id: "r1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", startTime: "10:00", endTime: "14:00" }),
    ];
    expect(peakConcurrent(res)).toBe(2);
  });

  it("時間未設定は終日カウント", () => {
    const res = [
      mkRes({ id: "r1" }), // 時間未設定 → 終日
      mkRes({ id: "r2", startTime: "09:00", endTime: "11:00" }),
    ];
    expect(peakConcurrent(res)).toBe(2); // allDay(1) + peak(1)
  });

  it("隣接予約（end==start）は重複しない", () => {
    const res = [
      mkRes({ id: "r1", startTime: "09:00", endTime: "11:00" }),
      mkRes({ id: "r2", startTime: "11:00", endTime: "13:00" }),
    ];
    expect(peakConcurrent(res)).toBe(1);
  });

  it("cancelled は除外", () => {
    const res = [
      mkRes({ id: "r1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", startTime: "10:00", endTime: "14:00", status: "cancelled" }),
    ];
    expect(peakConcurrent(res)).toBe(1);
  });

  it("シフト窓外（07:00–08:00）はクランプ", () => {
    const res = [mkRes({ id: "r1", startTime: "07:00", endTime: "07:30" })];
    // 08:00–19:00 にクランプ → 窓外なのでカウント 0
    expect(peakConcurrent(res)).toBe(0);
  });

  it("逆転時刻（end <= start）は無視", () => {
    const res = [mkRes({ id: "r1", startTime: "12:00", endTime: "09:00" })];
    expect(peakConcurrent(res)).toBe(0);
  });

  it("片方だけ設定は無視", () => {
    const res = [mkRes({ id: "r1", startTime: "09:00", endTime: null })];
    expect(peakConcurrent(res)).toBe(0);
  });
});

// ── computeBoothUtilization ──

describe("computeBoothUtilization", () => {
  it("予約なし → 稼働率 0", () => {
    const booth = mkBooth();
    const u = computeBoothUtilization(booth, []);
    expect(u.occupiedMinutes).toBe(0);
    expect(u.utilizationPct).toBe(0);
    expect(u.peakConcurrent).toBe(0);
  });

  it("3 時間の予約 → 稼働率 ~27%（11h 営業）", () => {
    const booth = mkBooth();
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" })];
    const u = computeBoothUtilization(booth, res);
    expect(u.occupiedMinutes).toBe(180);
    expect(u.totalMinutes).toBe(660); // 11h * 60
    expect(u.utilizationPct).toBe(27); // 180/660*100 = 27.27 → 27
  });

  it("終日予約 → 稼働率 100%", () => {
    const booth = mkBooth();
    const res = [mkRes({ id: "r1", boothId: "b1" })]; // 時間未設定 → 終日
    const u = computeBoothUtilization(booth, res);
    expect(u.utilizationPct).toBe(100);
  });

  it("他ブースの予約は含まない", () => {
    const booth = mkBooth();
    const res = [mkRes({ id: "r1", boothId: "b2", startTime: "09:00", endTime: "12:00" })];
    const u = computeBoothUtilization(booth, res);
    expect(u.occupiedMinutes).toBe(0);
  });

  it("no_show は稼働率から除外（completed は含める）", () => {
    const booth = mkBooth();
    const res = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00", status: "no_show" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "13:00", endTime: "14:00", status: "completed" }),
    ];
    const u = computeBoothUtilization(booth, res);
    // no_show(3h)は含まれず、completed(1h=60min)のみカウントされる
    expect(u.occupiedMinutes).toBe(60);
  });
});

// ── detectCapacityConflicts ──

describe("detectCapacityConflicts", () => {
  it("定員内 → 空配列", () => {
    const booth = mkBooth({ capacity: 2 });
    const res = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00" }),
    ];
    expect(detectCapacityConflicts(booth, res)).toHaveLength(0);
  });

  it("定員 1 で 2 予約重複 → conflict", () => {
    const booth = mkBooth({ capacity: 1 });
    const res = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00" }),
    ];
    const conflicts = detectCapacityConflicts(booth, res);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].peakConcurrent).toBe(2);
    expect(conflicts[0].capacity).toBe(1);
    expect(conflicts[0].reservationIds).toContain("r1");
    expect(conflicts[0].reservationIds).toContain("r2");
  });

  it("終日予約だけで定員超過", () => {
    const booth = mkBooth({ capacity: 1 });
    const res = [mkRes({ id: "r1", boothId: "b1" }), mkRes({ id: "r2", boothId: "b1" })];
    const conflicts = detectCapacityConflicts(booth, res);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].peakConcurrent).toBe(2);
  });

  it("終日超過 + timed 予約 → timed の ID も含む", () => {
    const booth = mkBooth({ capacity: 1 });
    const res = [
      mkRes({ id: "r1", boothId: "b1" }), // 終日
      mkRes({ id: "r2", boothId: "b1" }), // 終日
      mkRes({ id: "r3", boothId: "b1", startTime: "10:00", endTime: "12:00" }),
    ];
    const conflicts = detectCapacityConflicts(booth, res);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reservationIds).toContain("r3");
    expect(conflicts[0].peakConcurrent).toBe(3);
  });

  it("completed/no_show は定員超過チェックから除外", () => {
    const booth = mkBooth({ capacity: 1 });
    const res = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00", status: "completed" }),
    ];
    // completed は toEvents で cancelled と同様に除外される
    expect(detectCapacityConflicts(booth, res)).toHaveLength(0);
  });
});

// ── predictBoothFreeAt ──

describe("predictBoothFreeAt", () => {
  it("in_progress なし → null", () => {
    const res = [mkRes({ id: "r1", startTime: "09:00", endTime: "12:00", status: "confirmed" })];
    expect(predictBoothFreeAt(res, 10)).toBeNull();
  });

  it("in_progress の endTime を返す", () => {
    const res = [mkRes({ id: "r1", startTime: "09:00", endTime: "12:00", status: "in_progress" })];
    expect(predictBoothFreeAt(res, 10)).toBe(12);
  });

  it("endTime なしで estimatedMinutes から推定", () => {
    const res = [mkRes({ id: "r1", startTime: "09:00", endTime: null, estimatedMinutes: 180, status: "in_progress" })];
    // 09:00 + 180min = 12:00
    expect(predictBoothFreeAt(res, 10)).toBe(12);
  });

  it("複数 in_progress → 最も遅い終了時刻", () => {
    const res = [
      mkRes({ id: "r1", startTime: "09:00", endTime: "12:00", status: "in_progress" }),
      mkRes({ id: "r2", startTime: "10:00", endTime: "15:00", status: "in_progress" }),
    ];
    expect(predictBoothFreeAt(res, 11)).toBe(15);
  });

  it("既に終了済みの予約は含まない", () => {
    const res = [mkRes({ id: "r1", startTime: "09:00", endTime: "10:00", status: "in_progress" })];
    expect(predictBoothFreeAt(res, 11)).toBeNull();
  });
});

// ── findAvailableBooths ──

describe("findAvailableBooths", () => {
  it("予約なし → 全ブース空き", () => {
    const booths = [mkBooth({ id: "b1" }), mkBooth({ id: "b2", name: "ピット2" })];
    const result = findAvailableBooths(booths, [], 10);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.currentlyFree)).toBe(true);
  });

  it("予約中のブースは currentlyFree=false", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" })];
    const result = findAvailableBooths(booths, res, 10);
    expect(result[0].currentlyFree).toBe(false);
  });

  it("予約時間外は currentlyFree=true", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" })];
    const result = findAvailableBooths(booths, res, 14);
    expect(result[0].currentlyFree).toBe(true);
  });

  it("capacity=1 のとき空き時間帯を計算", () => {
    const booths = [mkBooth({ id: "b1", capacity: 1 })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "10:00", endTime: "12:00" })];
    const result = findAvailableBooths(booths, res, 14);
    expect(result[0].freeSlots).toEqual([
      { start: 8, end: 10 },
      { start: 12, end: 19 },
    ]);
  });

  it("非アクティブなブースは除外", () => {
    const booths = [mkBooth({ id: "b1", isActive: false })];
    expect(findAvailableBooths(booths, [], 10)).toHaveLength(0);
  });

  it("cancelled 予約は除外", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00", status: "cancelled" })];
    const result = findAvailableBooths(booths, res, 10);
    expect(result[0].currentlyFree).toBe(true);
  });

  it("completed/no_show 予約はブースを占有しない", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [
      mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00", status: "completed" }),
      mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00", status: "no_show" }),
    ];
    const result = findAvailableBooths(booths, res, 10);
    expect(result[0].currentlyFree).toBe(true);
    expect(result[0].freeSlots).toEqual([{ start: 8, end: 19 }]);
  });

  it("逆転時刻（end <= start）は終日占有扱いにせず無視", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "12:00", endTime: "09:00" })];
    const result = findAvailableBooths(booths, res, 10);
    expect(result[0].currentlyFree).toBe(true);
    expect(result[0].freeSlots).toEqual([{ start: 8, end: 19 }]);
  });

  it("片方だけ設定（データ不備）は終日占有扱いにせず無視", () => {
    const booths = [mkBooth({ id: "b1" })];
    const res = [mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: null })];
    const result = findAvailableBooths(booths, res, 10);
    expect(result[0].currentlyFree).toBe(true);
    expect(result[0].freeSlots).toEqual([{ start: 8, end: 19 }]);
  });
});
