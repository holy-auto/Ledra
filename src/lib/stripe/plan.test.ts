import { describe, it, expect, beforeEach, vi } from "vitest";
import { priceIdToPlanTier, planTierToPriceId } from "./plan";

// ─── priceIdToPlanTier ───
describe("priceIdToPlanTier", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
  });

  it("miniのpriceIdからminiプランを返す", () => {
    expect(priceIdToPlanTier("price_mini_123")).toBe("mini");
  });

  it("standardのpriceIdからstandardプランを返す", () => {
    expect(priceIdToPlanTier("price_standard_456")).toBe("standard");
  });

  it("proのpriceIdからproプランを返す", () => {
    expect(priceIdToPlanTier("price_pro_789")).toBe("pro");
  });

  it("一致しないpriceIdはnullを返す", () => {
    expect(priceIdToPlanTier("price_unknown")).toBeNull();
    expect(priceIdToPlanTier("")).toBeNull();
  });
});

// ─── planTierToPriceId ───
describe("planTierToPriceId", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
  });

  it("miniプランのpriceIdを返す", () => {
    expect(planTierToPriceId("mini")).toBe("price_mini_123");
  });

  it("standardプランのpriceIdを返す", () => {
    expect(planTierToPriceId("standard")).toBe("price_standard_456");
  });

  it("proプランのpriceIdを返す", () => {
    expect(planTierToPriceId("pro")).toBe("price_pro_789");
  });

  it("環境変数が未設定の場合はエラーを投げる", () => {
    vi.stubEnv("STRIPE_PRICE_MINI", "");
    expect(() => planTierToPriceId("mini")).toThrow("Missing STRIPE_PRICE");
  });
});
