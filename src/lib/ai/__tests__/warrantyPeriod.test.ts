import { describe, expect, it } from "vitest";
import { parseWarrantyPeriodMonths, computeWarrantyEndDate, getDaysUntilWarrantyEnd } from "@/lib/ai/followUpContent";

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

  it("sums combined year + month", () => {
    expect(parseWarrantyPeriodMonths("1年6ヶ月")).toBe(18);
    expect(parseWarrantyPeriodMonths("2年3ヶ月")).toBe(27);
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
  it("adds the parsed duration to the issue date", () => {
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "3年")).toBe("2029-01-15");
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "6ヶ月")).toBe("2026-07-15");
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "1年6ヶ月")).toBe("2027-07-15");
  });

  it("returns null for unparseable period or invalid date", () => {
    expect(computeWarrantyEndDate("2026-01-15T00:00:00Z", "保証なし")).toBeNull();
    expect(computeWarrantyEndDate("not-a-date", "3年")).toBeNull();
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
