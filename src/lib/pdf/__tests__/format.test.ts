import { describe, it, expect } from "vitest";
import { fmtJpy, fmtDate, fmtTotal } from "../format";

describe("pdf/format helpers", () => {
  it("fmtJpy formats yen with separators and handles null", () => {
    expect(fmtJpy(1234567)).toBe("¥1,234,567");
    expect(fmtJpy(0)).toBe("¥0");
    expect(fmtJpy(null)).toBe("-");
    expect(fmtJpy(undefined)).toBe("-");
  });

  it("fmtTotal formats without the yen sign", () => {
    expect(fmtTotal(1234567)).toBe("1,234,567");
    expect(fmtTotal(null)).toBe("-");
  });

  it("fmtDate renders in JST regardless of server TZ", () => {
    // 2026-01-01T15:30:00Z は UTC では 1/1 だが JST (+9h) では 1/2。
    // timeZone: Asia/Tokyo が効いていれば必ず 2026/1/2 になる。
    expect(fmtDate("2026-01-01T15:30:00Z")).toBe("2026/1/2");
    expect(fmtDate(null)).toBe("-");
    expect(fmtDate("not-a-date")).toBe("not-a-date");
  });
});
