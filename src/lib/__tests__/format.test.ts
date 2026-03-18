import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatJpy } from "../format";

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
});

describe("formatDateTime", () => {
  it("returns dash for null/undefined", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("formats valid ISO datetime", () => {
    const result = formatDateTime("2024-06-15T14:30:00Z");
    expect(result).toMatch(/2024/);
  });

  it("returns raw string for invalid date", () => {
    expect(formatDateTime("invalid")).toBe("invalid");
  });
});

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
});
