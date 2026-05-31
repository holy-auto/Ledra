import { describe, it, expect, afterEach } from "vitest";
import { estimateCallCostJpy, resolveCapJpy, VISION_CALL_COST_JPY } from "../costCap";

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("estimateCallCostJpy", () => {
  it("prices Haiku-light endpoints cheaply", () => {
    for (const ep of [
      "/api/admin/customer-inquiries/[id]/ai-classify",
      "/api/admin/reviews/ai-sentiment",
      "/api/admin/accounting/ai-categorize",
      "/api/admin/master-data/normalize",
      "/api/admin/menu-items/[id]/ai-price",
      "/api/admin/inventory/ai-pos-deduct",
      "/api/admin/thickness-reports/[id]/ai-anomaly",
    ]) {
      expect(estimateCallCostJpy(ep)).toBe(0.5);
    }
  });

  it("prices vision/description endpoints at the vision rate", () => {
    expect(estimateCallCostJpy("/api/admin/market-vehicles/[id]/ai-description")).toBe(VISION_CALL_COST_JPY);
  });

  it("falls back to the default for unknown / Sonnet-text endpoints", () => {
    expect(estimateCallCostJpy("/api/admin/certificates/ai-draft")).toBe(2.0);
    expect(estimateCallCostJpy("/api/admin/reservations/ai-from-message")).toBe(2.0);
  });
});

describe("resolveCapJpy", () => {
  it("prefers a positive per-tenant cap", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "5000";
    expect(resolveCapJpy(12000)).toBe(12000);
  });

  it("falls back to the env cap when no per-tenant value", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "5000";
    expect(resolveCapJpy(null)).toBe(5000);
    expect(resolveCapJpy(undefined)).toBe(5000);
    expect(resolveCapJpy(0)).toBe(5000);
  });

  it("returns 0 (disabled) when neither is set", () => {
    delete process.env.AI_MONTHLY_COST_CAP_JPY;
    expect(resolveCapJpy(null)).toBe(0);
    expect(resolveCapJpy(0)).toBe(0);
  });

  it("ignores non-positive / invalid caps", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "-1";
    expect(resolveCapJpy(undefined)).toBe(0);
    process.env.AI_MONTHLY_COST_CAP_JPY = "abc";
    expect(resolveCapJpy(undefined)).toBe(0);
  });
});
