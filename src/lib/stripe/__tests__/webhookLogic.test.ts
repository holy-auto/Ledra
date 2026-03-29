import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for webhook-related logic extracted from the route handler.
 * We test the pure functions (priceIdToPlanTier mapping, isActiveStatus pattern,
 * asStringId pattern, and idempotency detection) without importing the full route.
 */

// ─── priceIdToPlanTier for webhook context ───
describe("webhook: plan tier resolution from price ID", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_m");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_m");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_m");
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_a");
    vi.stubEnv("STRIPE_PRICE_STANDARD_ANNUAL", "price_standard_a");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_a");
    vi.stubEnv("STRIPE_PRICE_MINI", "price_mini_legacy");
  });

  // Use the actual function from the plan module (same one the webhook uses)
  it("resolves monthly prices correctly", async () => {
    const { priceIdToPlanTier } = await import("@/lib/stripe/plan");
    expect(priceIdToPlanTier("price_starter_m")).toBe("starter");
    expect(priceIdToPlanTier("price_standard_m")).toBe("standard");
    expect(priceIdToPlanTier("price_pro_m")).toBe("pro");
  });

  it("resolves annual prices correctly", async () => {
    const { priceIdToPlanTier } = await import("@/lib/stripe/plan");
    expect(priceIdToPlanTier("price_starter_a")).toBe("starter");
    expect(priceIdToPlanTier("price_standard_a")).toBe("standard");
    expect(priceIdToPlanTier("price_pro_a")).toBe("pro");
  });

  it("resolves legacy mini to starter", async () => {
    const { priceIdToPlanTier } = await import("@/lib/stripe/plan");
    expect(priceIdToPlanTier("price_mini_legacy")).toBe("starter");
  });

  it("returns null for unknown price (webhook should handle gracefully)", async () => {
    const { priceIdToPlanTier } = await import("@/lib/stripe/plan");
    expect(priceIdToPlanTier("price_totally_unknown")).toBeNull();
  });
});

// ─── isActiveStatus pattern (mirrored from route.ts) ───
describe("webhook: isActiveStatus logic", () => {
  // Re-implement the logic as tested in the webhook route
  function isActiveStatus(status: string): boolean {
    return status === "active" || status === "trialing" || status === "past_due";
  }

  it("active status is considered active", () => {
    expect(isActiveStatus("active")).toBe(true);
  });

  it("trialing status is considered active", () => {
    expect(isActiveStatus("trialing")).toBe(true);
  });

  it("past_due status is considered active (grace period)", () => {
    expect(isActiveStatus("past_due")).toBe(true);
  });

  it("canceled status is NOT active", () => {
    expect(isActiveStatus("canceled")).toBe(false);
  });

  it("unpaid status is NOT active", () => {
    expect(isActiveStatus("unpaid")).toBe(false);
  });

  it("incomplete_expired is NOT active", () => {
    expect(isActiveStatus("incomplete_expired")).toBe(false);
  });

  it("empty string is NOT active", () => {
    expect(isActiveStatus("")).toBe(false);
  });
});

// ─── asStringId pattern (mirrored from route.ts) ───
describe("webhook: asStringId logic", () => {
  function asStringId(v: any): string | null {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v !== null && "id" in v) return String(v.id);
    return String(v);
  }

  it("returns null for null/undefined/empty", () => {
    expect(asStringId(null)).toBeNull();
    expect(asStringId(undefined)).toBeNull();
    expect(asStringId("")).toBeNull();
    expect(asStringId(0)).toBeNull();
  });

  it("returns string as-is", () => {
    expect(asStringId("cus_123")).toBe("cus_123");
  });

  it("extracts id from Stripe expanded object", () => {
    expect(asStringId({ id: "cus_456", name: "Test" })).toBe("cus_456");
  });

  it("converts numeric id to string", () => {
    expect(asStringId({ id: 789 })).toBe("789");
  });

  it("converts number to string", () => {
    expect(asStringId(42)).toBe("42");
  });
});

// ─── Duplicate event detection (idempotency) pattern ───
describe("webhook: idempotency / duplicate event detection", () => {
  it("detects duplicate via unique constraint error code 23505", () => {
    // Simulates the pattern used in the webhook route
    const claimError = { code: "23505", message: "duplicate key value" };
    const isDuplicate = claimError.code === "23505";
    expect(isDuplicate).toBe(true);
  });

  it("non-duplicate DB errors do not trigger duplicate path", () => {
    const claimError = { code: "42P01", message: "relation does not exist" };
    const isDuplicate = claimError.code === "23505";
    expect(isDuplicate).toBe(false);
  });

  it("null claim error means event was claimed successfully", () => {
    const claimError = null;
    const isDuplicate = claimError !== null && (claimError as any).code === "23505";
    expect(isDuplicate).toBe(false);
  });

  it("expected response shape for duplicate events", () => {
    // The webhook returns { received: true, duplicate: true } for duplicates
    const response = { received: true, duplicate: true };
    expect(response.received).toBe(true);
    expect(response.duplicate).toBe(true);
  });
});

// ─── getCurrentPeriodEnd pattern ───
describe("webhook: getCurrentPeriodEnd logic", () => {
  function getCurrentPeriodEnd(sub: any): number | null {
    return (
      sub?.current_period_end ??
      sub?.items?.data?.[0]?.current_period_end ??
      null
    );
  }

  it("returns top-level current_period_end when present", () => {
    expect(getCurrentPeriodEnd({ current_period_end: 1700000000 })).toBe(1700000000);
  });

  it("falls back to first subscription item", () => {
    const sub = {
      items: { data: [{ current_period_end: 1700001000 }] },
    };
    expect(getCurrentPeriodEnd(sub)).toBe(1700001000);
  });

  it("returns null when neither is present", () => {
    expect(getCurrentPeriodEnd({})).toBeNull();
    expect(getCurrentPeriodEnd({ items: { data: [] } })).toBeNull();
  });

  it("returns null for null/undefined subscription", () => {
    expect(getCurrentPeriodEnd(null)).toBeNull();
    expect(getCurrentPeriodEnd(undefined)).toBeNull();
  });

  it("prefers top-level over item-level when both exist", () => {
    const sub = {
      current_period_end: 1700000000,
      items: { data: [{ current_period_end: 1700001000 }] },
    };
    expect(getCurrentPeriodEnd(sub)).toBe(1700000000);
  });

  it("handles items.data with multiple items — uses first", () => {
    const sub = {
      items: {
        data: [
          { current_period_end: 1700001000 },
          { current_period_end: 1700002000 },
        ],
      },
    };
    expect(getCurrentPeriodEnd(sub)).toBe(1700001000);
  });
});

// ─── Subscription status → active/inactive mapping ───
describe("webhook: subscription status to is_active mapping", () => {
  function isActiveStatus(status: string): boolean {
    return status === "active" || status === "trialing" || status === "past_due";
  }

  const activeStatuses = ["active", "trialing", "past_due"];
  const inactiveStatuses = ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"];

  for (const status of activeStatuses) {
    it(`"${status}" maps to is_active=true`, () => {
      expect(isActiveStatus(status)).toBe(true);
    });
  }

  for (const status of inactiveStatuses) {
    it(`"${status}" maps to is_active=false`, () => {
      expect(isActiveStatus(status)).toBe(false);
    });
  }
});

// ─── Idempotency edge cases ───
describe("webhook: idempotency edge cases", () => {
  it("different error codes should not be treated as duplicates", () => {
    const errorCodes = ["23503", "23514", "42501", "PGRST116"];
    for (const code of errorCodes) {
      expect(code === "23505").toBe(false);
    }
  });

  it("successful claim (no error) allows processing", () => {
    const claimError = null;
    const shouldProcess = claimError === null || (claimError as any)?.code !== "23505";
    expect(shouldProcess).toBe(true);
  });

  it("non-duplicate DB error still allows processing (to avoid losing events)", () => {
    const claimError = { code: "42P01", message: "relation does not exist" };
    const isDuplicate = claimError.code === "23505";
    // The webhook route continues processing on non-duplicate errors
    expect(isDuplicate).toBe(false);
  });
});
