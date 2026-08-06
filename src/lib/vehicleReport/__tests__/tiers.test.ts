import { describe, it, expect } from "vitest";
import { isCreatedAtInScope, scopeCutoffIso, scopeFromRow } from "../tiers";

const NOW = Date.UTC(2026, 6, 30); // 2026-07-30

describe("scopeFromRow", () => {
  it("maps a recent_months row to a bounded scope", () => {
    expect(scopeFromRow("recent_months", 12)).toEqual({ type: "recent_months", months: 12 });
  });

  it("falls back to full for full / null / bad months", () => {
    expect(scopeFromRow("full", null)).toEqual({ type: "full" });
    expect(scopeFromRow("recent_months", null)).toEqual({ type: "full" });
    expect(scopeFromRow("recent_months", 0)).toEqual({ type: "full" });
    expect(scopeFromRow(null, null)).toEqual({ type: "full" });
  });
});

describe("scopeCutoffIso", () => {
  it("is null for full (no lower bound)", () => {
    expect(scopeCutoffIso({ type: "full" }, NOW)).toBeNull();
  });

  it("is N calendar months before now for recent_months", () => {
    expect(scopeCutoffIso({ type: "recent_months", months: 12 }, NOW)).toBe(
      new Date(Date.UTC(2025, 6, 30)).toISOString(),
    );
  });
});

describe("isCreatedAtInScope", () => {
  it("discloses everything under full", () => {
    expect(isCreatedAtInScope(Date.UTC(2000, 0, 1), { type: "full" }, NOW)).toBe(true);
  });

  it("includes records at or after the recent_months cutoff", () => {
    const scope = { type: "recent_months", months: 12 } as const;
    expect(isCreatedAtInScope(Date.UTC(2026, 0, 1), scope, NOW)).toBe(true); // within last year
    expect(isCreatedAtInScope(Date.UTC(2025, 6, 30), scope, NOW)).toBe(true); // exactly at cutoff (>=)
  });

  it("excludes records older than the recent_months cutoff", () => {
    const scope = { type: "recent_months", months: 12 } as const;
    expect(isCreatedAtInScope(Date.UTC(2025, 0, 1), scope, NOW)).toBe(false); // 18 months ago
    expect(isCreatedAtInScope(Date.UTC(2025, 5, 30), scope, NOW)).toBe(false); // one day before cutoff
  });
});
