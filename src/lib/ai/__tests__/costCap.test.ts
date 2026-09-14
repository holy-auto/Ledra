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

  // `.env.example` が長らく `AI_MONTHLY_COST_CAP_JPY=0` を配っていたので、
  // 0 は「上限なしにしたい」という意思表示ではなく、ただの配布既定値。
  // 0 を尊重すると、まさに守りたい本番でブレーキが無効のままになる
  // （PR #1027 の /code-review 指摘）。0 に意味を持たせない。
  it("env の 0 は「未設定」として扱い、既定へ倒す", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "0";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    expect(resolveCapJpy(null)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
  });

  it("負値・非数・空文字も設定ミスなので既定へ倒す（ブレーキが外れる方に倒さない）", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "-1";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    process.env.AI_MONTHLY_COST_CAP_JPY = "abc";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
    process.env.AI_MONTHLY_COST_CAP_JPY = "   ";
    expect(resolveCapJpy(undefined)).toBe(DEFAULT_MONTHLY_COST_CAP_JPY);
  });

  it("上限を実質無効にしたいときは大きい値を入れる（0 では無効にならない）", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "99999999";
    expect(resolveCapJpy(undefined)).toBe(99999999);
  });

  it("テナント個別上限は env より優先する", () => {
    process.env.AI_MONTHLY_COST_CAP_JPY = "0";
    expect(resolveCapJpy(3000)).toBe(3000);
  });
});
