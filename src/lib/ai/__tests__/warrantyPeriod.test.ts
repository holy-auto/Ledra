import { describe, expect, it } from "vitest";
import {
  parseWarrantyPeriodMonths,
  computeWarrantyEndDate,
  getDaysUntilWarrantyEnd,
  daysUntilJstDate,
} from "@/lib/ai/followUpContent";

describe("parseWarrantyPeriodMonths", () => {
  it("parses years", () => {
    expect(parseWarrantyPeriodMonths("3年")).toBe(36);
    expect(parseWarrantyPeriodMonths("10年")).toBe(120);
  });

  it("parses months (ヶ月 / カ月 / ケ月 / か月)", () => {
    expect(parseWarrantyPeriodMonths("12ヶ月")).toBe(12);
    expect(parseWarrantyPeriodMonths("6カ月")).toBe(6);
    expect(parseWarrantyPeriodMonths("6ケ月")).toBe(6);
    expect(parseWarrantyPeriodMonths("18か月")).toBe(18);
  });

  it("sums combined year + residual month", () => {
    expect(parseWarrantyPeriodMonths("1年6ヶ月")).toBe(18);
    expect(parseWarrantyPeriodMonths("2年3ヶ月")).toBe(27);
  });

  it("does not double-count equivalent year/month restatements", () => {
    // 年が併記され、月成分が 12 以上のときは重複表記とみなし月を無視する。
    expect(parseWarrantyPeriodMonths("3年（36ヶ月）")).toBe(36);
    expect(parseWarrantyPeriodMonths("2 years / 24 months")).toBe(24);
  });

  it("parses English units", () => {
    expect(parseWarrantyPeriodMonths("36 months")).toBe(36);
    expect(parseWarrantyPeriodMonths("2 years")).toBe(24);
  });

  it("returns null for unparseable / empty", () => {
    expect(parseWarrantyPeriodMonths("通常使用に限る")).toBeNull();
    expect(parseWarrantyPeriodMonths("")).toBeNull();
    expect(parseWarrantyPeriodMonths(null)).toBeNull();
    expect(parseWarrantyPeriodMonths(undefined)).toBeNull();
  });
});

describe("computeWarrantyEndDate", () => {
  it("adds the parsed duration to the (JST) issue date", () => {
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "3年")).toBe("2029-01-15");
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "6ヶ月")).toBe("2026-07-15");
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "1年6ヶ月")).toBe("2027-07-15");
  });

  it("clamps month-end overflow to the end of the month", () => {
    // 1/31 + 1ヶ月 は 3/3 ではなく 2/28 に丸める。
    expect(computeWarrantyEndDate("2026-01-31T00:00:00Z", "1ヶ月")).toBe("2026-02-28");
  });

  it("uses the JST calendar date (not the UTC day) of the issue timestamp", () => {
    // 2026-01-15 15:30 UTC = JST 2026-01-16 00:30 → 1年後は 2027-01-16。
    expect(computeWarrantyEndDate("2026-01-15T15:30:00Z", "1年")).toBe("2027-01-16");
  });

  it("returns null for unparseable period or invalid date", () => {
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "保証なし")).toBeNull();
    expect(computeWarrantyEndDate("not-a-date", "3年")).toBeNull();
  });
});

describe("daysUntilJstDate", () => {
  it("returns whole-day differences independent of the current time of day", () => {
    const ymd = (d: Date) => {
      const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
    };
    const plus = new Date();
    plus.setDate(plus.getDate() + 60);
    expect(daysUntilJstDate(ymd(plus))).toBe(60);
    expect(daysUntilJstDate(ymd(new Date()))).toBe(0);
  });

  it("accepts a full timestamp string and uses only the date part", () => {
    const today = new Date();
    const j = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const ymd = `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
    expect(daysUntilJstDate(`${ymd}T00:00:00+00:00`)).toBe(0);
  });

  it("returns null for malformed input", () => {
    expect(daysUntilJstDate(null)).toBeNull();
    expect(daysUntilJstDate("nope")).toBeNull();
  });
});

describe("getDaysUntilWarrantyEnd", () => {
  it("now handles month-based periods (previously returned null)", () => {
    // 施工日 = 今日 + 6ヶ月相当 で残り日数が正になる。
    const issued = new Date();
    issued.setMonth(issued.getMonth() - 5); // 5ヶ月前に施工、保証 6ヶ月 → 残り ~1ヶ月
    const days = getDaysUntilWarrantyEnd(issued.toISOString(), "6ヶ月");
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(20);
    expect(days!).toBeLessThan(40);
  });

  it("returns null for unparseable period", () => {
    expect(getDaysUntilWarrantyEnd("2026-01-15T00:00:00Z", "保証対象外")).toBeNull();
  });
});
