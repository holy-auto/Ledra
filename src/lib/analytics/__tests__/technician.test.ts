import { describe, expect, it } from "vitest";
import { normalizeDate } from "@/lib/analytics/technician";

describe("technician normalizeDate", () => {
  it("passes through valid YYYY-MM-DD", () => {
    expect(normalizeDate("2026-06-13")).toBe("2026-06-13");
  });

  it("rejects malformed or non-date input", () => {
    expect(normalizeDate("2026/06/13")).toBeNull();
    expect(normalizeDate("13-06-2026")).toBeNull();
    expect(normalizeDate("not-a-date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});
