import { describe, it, expect } from "vitest";
import { deriveBoothSignals, type BoothSignalInput } from "../boothSignals";
import type { BoothInfo, BoothReservation } from "../occupancy";

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

const mkInput = (overrides?: Partial<BoothSignalInput>): BoothSignalInput => ({
  booths: [mkBooth()],
  reservations: [],
  nowHours: 10,
  ...overrides,
});

// ── テスト ──

describe("deriveBoothSignals", () => {
  it("入力なし → シグナルなし", () => {
    expect(deriveBoothSignals(mkInput())).toHaveLength(0);
  });

  it("ブース未割当の予約 → assign_booth シグナル", () => {
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [mkRes({ id: "r1", boothId: "" }), mkRes({ id: "r2", boothId: "" })],
      }),
    );
    const assign = signals.find((s) => s.kind === "assign_booth");
    expect(assign).toBeDefined();
    expect(assign!.reservationIds).toHaveLength(2);
    expect(assign!.message).toContain("2件");
  });

  it("in_progress でブース未割当 → priority=high", () => {
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [mkRes({ id: "r1", boothId: "", status: "in_progress" })],
      }),
    );
    const assign = signals.find((s) => s.kind === "assign_booth");
    expect(assign!.priority).toBe("high");
  });

  it("定員超過 → capacity_exceeded シグナル", () => {
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [
          mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
          mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00" }),
        ],
      }),
    );
    const exceeded = signals.find((s) => s.kind === "capacity_exceeded");
    expect(exceeded).toBeDefined();
    expect(exceeded!.priority).toBe("high");
    expect(exceeded!.message).toContain("定員超過");
  });

  it("稼働率閾値超え → booth_overloaded シグナル", () => {
    // 10h の予約 / 11h 営業 ≈ 91% → 閾値 90% 超え
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [mkRes({ id: "r1", boothId: "b1", startTime: "08:00", endTime: "18:00" })],
        utilizationThreshold: 90,
      }),
    );
    const overloaded = signals.find((s) => s.kind === "booth_overloaded");
    expect(overloaded).toBeDefined();
    expect(overloaded!.priority).toBe("med");
  });

  it("no_show の予約は稼働率に含まれず booth_overloaded を誤発火させない", () => {
    // no_show(10h)のみ。稼働率計算から除外されれば utilizationPct=0 のまま
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [mkRes({ id: "r1", boothId: "b1", startTime: "08:00", endTime: "18:00", status: "no_show" })],
        utilizationThreshold: 90,
      }),
    );
    expect(signals.find((s) => s.kind === "booth_overloaded")).toBeUndefined();
  });

  it("完了した予約 + 待機中の未割当予約 → booth_freed シグナル", () => {
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [
          mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00", status: "completed" }),
          mkRes({ id: "r2", boothId: "", status: "confirmed" }),
        ],
      }),
    );
    const freed = signals.find((s) => s.kind === "booth_freed");
    expect(freed).toBeDefined();
    expect(freed!.boothName).toBe("ピット1");
    expect(freed!.message).toContain("空きました");
  });

  it("cancelled/completed/no_show はブース未割当チェック対象外", () => {
    const signals = deriveBoothSignals(
      mkInput({
        reservations: [
          mkRes({ id: "r1", boothId: "", status: "cancelled" }),
          mkRes({ id: "r2", boothId: "", status: "completed" }),
          mkRes({ id: "r3", boothId: "", status: "no_show" }),
        ],
      }),
    );
    expect(signals.find((s) => s.kind === "assign_booth")).toBeUndefined();
  });

  it("シグナルは priority 順にソート", () => {
    const signals = deriveBoothSignals(
      mkInput({
        booths: [mkBooth()],
        reservations: [
          // booth_overloaded (med)
          mkRes({ id: "r1", boothId: "b1", startTime: "08:00", endTime: "18:00" }),
          // capacity_exceeded (high) — 同時に重なるもう一つ
          mkRes({ id: "r2", boothId: "b1", startTime: "09:00", endTime: "17:00" }),
          // assign_booth (med)
          mkRes({ id: "r3", boothId: "" }),
        ],
      }),
    );
    expect(signals.length).toBeGreaterThan(0);
    // high が先に来る
    const priorities = signals.map((s) => s.priority);
    const highIdx = priorities.indexOf("high");
    const medIdx = priorities.indexOf("med");
    if (highIdx >= 0 && medIdx >= 0) {
      expect(highIdx).toBeLessThan(medIdx);
    }
  });

  it("非アクティブなブースはチェックしない", () => {
    const signals = deriveBoothSignals(
      mkInput({
        booths: [mkBooth({ isActive: false })],
        reservations: [
          mkRes({ id: "r1", boothId: "b1", startTime: "09:00", endTime: "12:00" }),
          mkRes({ id: "r2", boothId: "b1", startTime: "10:00", endTime: "14:00" }),
        ],
      }),
    );
    // capacity_exceeded は出ない（非アクティブブースはスキップ）
    expect(signals.find((s) => s.kind === "capacity_exceeded")).toBeUndefined();
  });
});
