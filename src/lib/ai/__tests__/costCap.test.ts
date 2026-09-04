import { describe, it, expect, afterEach } from "vitest";
import { DEFAULT_MONTHLY_COST_CAP_JPY, estimateCallCostJpy, resolveCapJpy, VISION_CALL_COST_JPY } from "../costCap";

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

  // 以前はここが 0 (=ブレーキ無し) だった。本番でも env・テナント個別のどちらも
  // 設定されておらず、安全ブレーキが1つも効いていなかった (2026-09-04 に実測して発覚)。
  // 設定漏れでブレーキが外れる設計が誤りだったので、既定を効く側に倒した。
  it("設定が無ければ既定 (テナント1件あたり月1万円) を使う", () => {
    delete process.env.AI_MONTHLY_COST_CAP_JPY;
    expect(resolveCapJpy(null)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    expect(resolveCapJpy(0)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
  });

  it("既定は 1 万円（変えたらこのテストで気づく）", () => {
    expect(DEFAULT_MONTHLY_COST_CAP_JPY).toBe(10_000);
  });

  it("env の明示的な 0 は「上限なし」として尊重する", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "0";
    expect(resolveCapJpy(undefined)).toBe(0);
    expect(resolveCapJpy(null)).toBe(0);
  });

  it("負値・非数・空文字は設定ミスなので既定へ倒す（ブレーキが外れる方に倒さない）", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "-1";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    process.env.AI_MONTHLY_COST_CAP_JPY = "abc";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    process.env.AI_MONTHLY_COST_CAP_JPY = "   ";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
  });

  it("テナント個別上限は env の 0 より優先する", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "0";
    expect(resolveCapJpy(3000)).toBe(3000);
  });
});
