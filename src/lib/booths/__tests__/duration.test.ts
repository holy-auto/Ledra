import { describe, it, expect } from "vitest";
import { sizeMultiplier, estimateReservationMinutes, formatMinutes } from "../duration";

describe("sizeMultiplier", () => {
  it("returns 1.0 for M / null / unknown", () => {
    expect(sizeMultiplier("M")).toBe(1.0);
    expect(sizeMultiplier(null)).toBe(1.0);
    expect(sizeMultiplier("???")).toBe(1.0);
  });
  it("is case-insensitive", () => {
    expect(sizeMultiplier("xl")).toBe(1.5);
    expect(sizeMultiplier(" ll ")).toBe(1.3);
  });
});

describe("estimateReservationMinutes", () => {
  it("sums base minutes and applies size multiplier", () => {
    expect(estimateReservationMinutes([{ estimated_minutes: 60 }, { estimated_minutes: 30 }], "M")).toBe(90);
    // 90 * 1.15 = 103.4999… (浮動小数) → Math.round → 103
    expect(estimateReservationMinutes([{ estimated_minutes: 60 }, { estimated_minutes: 30 }], "L")).toBe(103);
  });
  it("ignores null/invalid minutes but keeps valid ones", () => {
    expect(estimateReservationMinutes([{ estimated_minutes: null }, { estimated_minutes: 40 }], "M")).toBe(40);
  });
  it("returns null when there is no duration data", () => {
    expect(estimateReservationMinutes([{ estimated_minutes: null }], "M")).toBeNull();
    expect(estimateReservationMinutes([], "M")).toBeNull();
    expect(estimateReservationMinutes(null, "M")).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatMinutes(90)).toBe("1時間30分");
    expect(formatMinutes(60)).toBe("1時間");
    expect(formatMinutes(45)).toBe("45分");
  });
  it("returns dash for empty/invalid", () => {
    expect(formatMinutes(0)).toBe("—");
    expect(formatMinutes(null)).toBe("—");
  });
});
