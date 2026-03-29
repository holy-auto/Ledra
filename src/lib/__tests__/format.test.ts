import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatUnix, formatJpy } from "../format";

// ─── formatDate ───
describe("formatDate", () => {
  it("returns dash for null/undefined", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate("")).toBe("-");
  });

  it("formats valid ISO date", () => {
    const result = formatDate("2024-01-15T00:00:00Z");
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/15/);
  });

  it("returns raw string for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("formats date-only string (no time component)", () => {
    const result = formatDate("2024-12-25");
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/12/);
    expect(result).toMatch(/25/);
  });

  it("formats ISO date with timezone offset", () => {
    const result = formatDate("2024-06-01T09:00:00+09:00");
    expect(result).toMatch(/2024/);
  });
});

// ─── formatDateTime ───
describe("formatDateTime", () => {
  it("returns dash for null/undefined", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(formatDateTime("")).toBe("-");
  });

  it("formats valid ISO datetime", () => {
    const result = formatDateTime("2024-06-15T14:30:00Z");
    expect(result).toMatch(/2024/);
  });

  it("returns raw string for invalid date", () => {
    expect(formatDateTime("invalid")).toBe("invalid");
  });

  it("includes time component in output", () => {
    const result = formatDateTime("2024-03-15T10:30:00Z");
    // ja-JP locale includes time; just verify it's longer than date-only
    expect(result.length).toBeGreaterThan(formatDate("2024-03-15T10:30:00Z").length);
  });
});

// ─── formatUnix ───
describe("formatUnix", () => {
  it("returns dash for null", () => {
    expect(formatUnix(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatUnix(undefined)).toBe("-");
  });

  it("formats Unix epoch 0 as 1970 date", () => {
    const result = formatUnix(0);
    expect(result).toMatch(/1970/);
  });

  it("formats a known Unix timestamp", () => {
    // 2024-01-01 00:00:00 UTC = 1704067200
    const result = formatUnix(1704067200);
    expect(result).toMatch(/2024/);
  });

  it("formats recent timestamp correctly", () => {
    // 2024-06-15 12:00:00 UTC = 1718452800
    const result = formatUnix(1718452800);
    expect(result).toMatch(/2024/);
  });

  it("handles large future timestamps", () => {
    // 2030-01-01 00:00:00 UTC = 1893456000
    const result = formatUnix(1893456000);
    expect(result).toMatch(/2030/);
  });

  it("handles negative timestamps (dates before epoch)", () => {
    // -86400 = 1969-12-31 00:00:00 UTC
    const result = formatUnix(-86400);
    expect(result).toMatch(/1969/);
  });
});

// ─── formatJpy ───
describe("formatJpy", () => {
  it("returns dash for null/undefined", () => {
    expect(formatJpy(null)).toBe("-");
    expect(formatJpy(undefined)).toBe("-");
  });

  it("formats zero", () => {
    expect(formatJpy(0)).toBe("¥0");
  });

  it("formats positive numbers with commas", () => {
    const result = formatJpy(12000);
    expect(result).toBe("¥12,000");
  });

  it("formats large numbers", () => {
    const result = formatJpy(1234567);
    expect(result).toBe("¥1,234,567");
  });

  it("formats negative numbers", () => {
    const result = formatJpy(-500);
    expect(result).toContain("500");
    expect(result).toContain("¥");
  });

  it("formats small numbers without commas", () => {
    expect(formatJpy(999)).toBe("¥999");
  });

  it("formats very large numbers", () => {
    const result = formatJpy(100000000);
    expect(result).toBe("¥100,000,000");
  });

  it("formats single digit", () => {
    expect(formatJpy(1)).toBe("¥1");
  });
});
