import { describe, it, expect } from "vitest";
import {
  enrichJobWithBoothContext,
  boothSignalsForReservation,
  deriveBoothContextForJob,
  type JobWithBoothContext,
} from "../boothJobIntegration";
import type { BoothSignal } from "@/lib/booths/boothSignals";

// ── ヘルパ ──

const mkInput = (overrides?: Partial<JobWithBoothContext>): JobWithBoothContext => ({
  reservationId: "res-1",
  status: "arrived",
  hasCustomer: true,
  hasVehicle: true,
  hasActiveCertificate: false,
  hasUnpaidInvoice: false,
  hasOverdueInvoice: false,
  minutesSinceStatusChange: 10,
  estimatedDurationMin: 120,
  hasBoothAssigned: true,
  boothCapacityExceeded: false,
  ...overrides,
});

const mkSignal = (overrides?: Partial<BoothSignal>): BoothSignal => ({
  kind: "assign_booth",
  boothId: null,
  boothName: null,
  reservationIds: ["res-1"],
  message: "ブース未割当の予約が1件あります。",
  priority: "high",
  ...overrides,
});

// ── enrichJobWithBoothContext ──

describe("enrichJobWithBoothContext", () => {
  it("ブース割当済み → 元の結果をそのまま返す", () => {
    const result = enrichJobWithBoothContext(mkInput({ hasBoothAssigned: true }));
    expect(result.priorityAdjusted).toBe(false);
    expect(result.boothHint).toBeUndefined();
    expect(result.action).toBe("start_work"); // arrived → start_work
  });

  it("arrived + ブース未割当 → priority を high に引き上げ", () => {
    const result = enrichJobWithBoothContext(mkInput({ status: "arrived", hasBoothAssigned: false }));
    expect(result.priority).toBe("high");
    expect(result.boothHint).toContain("ブースが未割当");
    // arrived の base は "high" なので adjusted は false
    expect(result.priorityAdjusted).toBe(false);
  });

  it("in_progress + ブース未割当 → priority を high に引き上げ + ヒント", () => {
    const result = enrichJobWithBoothContext(mkInput({ status: "in_progress", hasBoothAssigned: false }));
    expect(result.priority).toBe("high");
    expect(result.boothHint).toContain("ブースが未割当");
  });

  it("confirmed + ブース未割当 → ヒントなし（来店前なので）", () => {
    const result = enrichJobWithBoothContext(mkInput({ status: "confirmed", hasBoothAssigned: false }));
    expect(result.boothHint).toBeUndefined();
    expect(result.priorityAdjusted).toBe(false);
  });

  it("定員超過 → ヒント追加（priority は変えない）", () => {
    const result = enrichJobWithBoothContext(mkInput({ boothCapacityExceeded: true }));
    expect(result.boothHint).toContain("定員超過");
    expect(result.priorityAdjusted).toBe(false);
  });

  it("期限超過請求があれば元の follow_up_overdue が優先（ブースより金銭）", () => {
    const result = enrichJobWithBoothContext(mkInput({ hasOverdueInvoice: true, hasBoothAssigned: false }));
    expect(result.action).toBe("follow_up_overdue");
    // overdue が先に判定されるため boothHint は付かない
    // （arrived + ブース未割当でも overdue が勝つ）
    expect(result.boothHint).toBeUndefined();
    expect(result.priority).toBe("high");
    expect(result.priorityAdjusted).toBe(false);
  });

  it("期限超過請求があれば定員超過より優先（boothHint を上書きしない）", () => {
    const result = enrichJobWithBoothContext(mkInput({ hasOverdueInvoice: true, boothCapacityExceeded: true }));
    expect(result.action).toBe("follow_up_overdue");
    expect(result.boothHint).toBeUndefined();
  });
});

// ── boothSignalsForReservation ──

describe("boothSignalsForReservation", () => {
  it("reservationId に一致するシグナルのみ返す", () => {
    const signals = [
      mkSignal({ reservationIds: ["res-1", "res-2"] }),
      mkSignal({ kind: "booth_freed", reservationIds: ["res-3"] }),
      mkSignal({ kind: "capacity_exceeded", reservationIds: ["res-1"] }),
    ];

    const result = boothSignalsForReservation(signals, "res-1");
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.kind)).toContain("assign_booth");
    expect(result.map((s) => s.kind)).toContain("capacity_exceeded");
  });

  it("一致なし → 空配列", () => {
    expect(boothSignalsForReservation([mkSignal({ reservationIds: ["other"] })], "res-99")).toEqual([]);
  });
});

// ── deriveBoothContextForJob ──

describe("deriveBoothContextForJob", () => {
  it("assign_booth シグナルあり → hasBoothAssigned = false", () => {
    const result = deriveBoothContextForJob([mkSignal({ kind: "assign_booth" })]);
    expect(result.hasBoothAssigned).toBe(false);
    expect(result.boothCapacityExceeded).toBe(false);
  });

  it("capacity_exceeded シグナルあり → boothCapacityExceeded = true", () => {
    const result = deriveBoothContextForJob([mkSignal({ kind: "capacity_exceeded" })]);
    expect(result.hasBoothAssigned).toBe(true);
    expect(result.boothCapacityExceeded).toBe(true);
  });

  it("シグナルなし → 割当済み・超過なし", () => {
    const result = deriveBoothContextForJob([]);
    expect(result.hasBoothAssigned).toBe(true);
    expect(result.boothCapacityExceeded).toBe(false);
  });
});
