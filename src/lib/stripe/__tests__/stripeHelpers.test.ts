import { describe, it, expect, beforeEach, vi } from "vitest";
import { priceIdToPlanTier, planTierToPriceId } from "../plan";

describe("priceIdToPlanTier — edge cases", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_old");
  });

  it("returns null for undefined price ID", () => {
    expect(priceIdToPlanTier(undefined as unknown as string)).toBeNull();
  });

  it("returns null when env vars are empty strings", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "");
    vi.stubEnv("STRIPE_PRICE_PRO", "");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "");
    vi.stubEnv("STRIPE_PRICE_MINI", "");
    expect(priceIdToPlanTier("price_starter_123")).toBeNull();
  });

  it("is case-sensitive — wrong casing returns null", () => {
    expect(priceIdToPlanTier("PRICE_STARTER_123")).toBeNull();
    expect(priceIdToPlanTier("Price_Starter_123")).toBeNull();
  });

  it("does not match partial price IDs", () => {
    expect(priceIdToPlanTier("price_starter_12")).toBeNull();
    expect(priceIdToPlanTier("price_starter_1234")).toBeNull();
  });

  it("mini env var unset — price_mini_old returns null", () => {
    vi.stubEnv("STRIPE_PRICE_MINI", "");
    expect(priceIdToPlanTier("price_mini_old")).toBeNull();
  });

  it("mini is checked before starter when both match same price", () => {
    // If mini env matches the same price as starter, mini branch runs first
    vi.stubEnv("STRIPE_PRICE_MINI", "price_starter_123");
    // mini match returns "starter" anyway, so result is still starter
    expect(priceIdToPlanTier("price_starter_123")).toBe("starter");
  });

  it("handles whitespace in price ID — no match", () => {
    expect(priceIdToPlanTier(" price_starter_123")).toBeNull();
    expect(priceIdToPlanTier("price_starter_123 ")).toBeNull();
  });
});

describe("planTierToPriceId — edge cases", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
  });

  it("throws for free plan with annual=true as well", () => {
    expect(() => planTierToPriceId("free", true)).toThrow(
      "Free plan does not require a Stripe Price"
    );
  });

  it("throws when annual env var missing but monthly exists", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "");
    expect(() => planTierToPriceId("starter", true)).toThrow(
      "Missing STRIPE_PRICE"
    );
  });

  it("throws descriptive error including plan name", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "");
    expect(() => planTierToPriceId("pro")).toThrow("pro");
  });

  it("throws descriptive error with (annual) suffix for annual plans", () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "");
    expect(() => planTierToPriceId("standard", true)).toThrow("(annual)");
  });

  it("returns correct monthly price when annual=false (default)", () => {
    expect(planTierToPriceId("starter")).toBe("price_starter_123");
    expect(planTierToPriceId("starter", false)).toBe("price_starter_123");
  });

  it("handles unknown plan tier gracefully", () => {
    // TypeScript would prevent this, but at runtime it would hit the map lookup
    expect(() => planTierToPriceId("enterprise" as any)).toThrow(
      "Missing STRIPE_PRICE"
    );
  });

  it("all three paid tiers return correct monthly prices", () => {
    expect(planTierToPriceId("starter", false)).toBe("price_starter_123");
    expect(planTierToPriceId("standard", false)).toBe("price_standard_456");
    expect(planTierToPriceId("pro", false)).toBe("price_pro_789");
  });

  it("all three paid tiers return correct annual prices", () => {
    expect(planTierToPriceId("starter", true)).toBe("price_starter_annual");
    expect(planTierToPriceId("standard", true)).toBe("price_standard_annual");
    expect(planTierToPriceId("pro", true)).toBe("price_pro_annual");
  });
});

// ─── Round-trip consistency: planTierToPriceId -> priceIdToPlanTier ───
describe("plan mapping round-trip consistency", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_123");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_456");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_789");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_old");
  });

  it("monthly price round-trips back to same tier", () => {
    for (const tier of ["starter", "standard", "pro"] as const) {
      const priceId = planTierToPriceId(tier, false);
      expect(priceIdToPlanTier(priceId)).toBe(tier);
    }
  });

  it("annual price round-trips back to same tier", () => {
    for (const tier of ["starter", "standard", "pro"] as const) {
      const priceId = planTierToPriceId(tier, true);
      expect(priceIdToPlanTier(priceId)).toBe(tier);
    }
  });
});
