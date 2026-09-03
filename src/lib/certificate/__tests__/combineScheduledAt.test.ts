import { describe, it, expect } from "vitest";
import { combineScheduledAt } from "@/lib/certificate/publicData";

describe("combineScheduledAt", () => {
  it("combines date and time into ISO 8601", () => {
    const iso = combineScheduledAt("2026-04-15", "10:30", null);
    expect(iso).toBeTruthy();
    expect(new Date(iso!).toISOString()).toMatch(/2026-04-15T\d{2}:\d{2}:00\.000Z/);
  });

  it("trims sub-minute precision (HH:MM:SS → HH:MM)", () => {
    const iso = combineScheduledAt("2026-04-15", "10:30:45", null);
    const parsed = new Date(iso!);
    expect(parsed.getUTCSeconds()).toBe(0);
  });

  it("uses 00:00 when start_time is missing", () => {
    const iso = combineScheduledAt("2026-04-15", null, null);
    expect(iso).toBeTruthy();
    // 予約日は店舗のローカル日付。ISO化すると日本時間 00:00 は前日 15:00Z になる。
    expect(new Date(iso!).getHours()).toBe(0);
    expect(new Date(iso!).getMinutes()).toBe(0);
  });

  it("falls back to fallback when date is missing", () => {
    const fallback = "2026-04-01T05:00:00.000Z";
    expect(combineScheduledAt(null, "10:00", fallback)).toBe(fallback);
  });

  it("returns null when date is missing and no fallback provided", () => {
    expect(combineScheduledAt(null, "10:00", null)).toBeNull();
  });

  it("returns the fallback for unparseable dates", () => {
    const fallback = "2026-04-01T05:00:00.000Z";
    expect(combineScheduledAt("not-a-date", "10:00", fallback)).toBe(fallback);
  });
});
