import { describe, it, expect, beforeEach, vi } from "vitest";
import { priceIdToPlanTier, planTierToPriceId } from "./plan";

// ─── priceIdToPlanTier ───
describe("priceIdToPlanTier", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_old");
  });

  it("starterのpriceIdからstarterプランを返す", () => {
    expect(priceIdToPlanTier("price_starter_123")).toBe("starter");
  });

  it("standardのpriceIdからstandardプランを返す", () => {
    expect(priceIdToPlanTier("price_standard_456")).toBe("standard");
  });

  it("proのpriceIdからproプランを返す", () => {
    expect(priceIdToPlanTier("price_pro_789")).toBe("pro");
  });

  it("年額プランも正しくマッピング", () => {
    expect(priceIdToPlanTier("price_starter_annual")).toBe("starter");
    expect(priceIdToPlanTier("price_standard_annual")).toBe("standard");
    expect(priceIdToPlanTier("price_pro_annual")).toBe("pro");
  });

  it("旧miniのpriceIdはstarterにマッピング", () => {
    expect(priceIdToPlanTier("price_mini_old")).toBe("starter");
  });

  it("一致しないpriceIdはnullを返す", () => {
    expect(priceIdToPlanTier("price_unknown")).toBeNull();
    expect(priceIdToPlanTier("")).toBeNull();
  });
});

// ─── planTierToPriceId ───
describe("planTierToPriceId", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
  });

  it("starterプランのpriceIdを返す", () => {
    expect(planTierToPriceId("starter")).toBe("price_starter_123");
  });

  it("standardプランのpriceIdを返す", () => {
    expect(planTierToPriceId("standard")).toBe("price_standard_456");
  });

  it("proプランのpriceIdを返す", () => {
    expect(planTierToPriceId("pro")).toBe("price_pro_789");
  });

  it("年額プランのpriceIdを返す", () => {
    expect(planTierToPriceId("starter", true)).toBe("price_starter_annual");
    expect(planTierToPriceId("standard", true)).toBe("price_standard_annual");
    expect(planTierToPriceId("pro", true)).toBe("price_pro_annual");
  });

  it("freeプランはエラーを投げる", () => {
    expect(() => planTierToPriceId("free")).toThrow("Free plan does not require a Stripe Price");
  });

  it("環境変数が未設定の場合はエラーを投げる", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "");
    expect(() => planTierToPriceId("starter")).toThrow("Missing STRIPE_PRICE");
  });
});
