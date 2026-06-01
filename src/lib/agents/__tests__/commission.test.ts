import { describe, it, expect } from "vitest";
import { computeCommissionAmount, PRECONTRACT_STATUSES } from "@/lib/agents/commission";

describe("computeCommissionAmount", () => {
  it("percentage: 10% of ¥24,800 = ¥2,480", () => {
    expect(computeCommissionAmount({ baseAmount: 24800, rate: 10, type: "percentage", fixed: 0 })).toBe(2480);
  });

  it("percentage: rounds to nearest yen", () => {
    // 9800 * 12.5% = 1225
    expect(computeCommissionAmount({ baseAmount: 9800, rate: 12.5, type: "percentage", fixed: 0 })).toBe(1225);
    // 9801 * 10% = 980.1 -> 980
    expect(computeCommissionAmount({ baseAmount: 9801, rate: 10, type: "percentage", fixed: 0 })).toBe(980);
    // 9805 * 10% = 980.5 -> 981 (round half up)
    expect(computeCommissionAmount({ baseAmount: 9805, rate: 10, type: "percentage", fixed: 0 })).toBe(981);
  });

  it("fixed: returns the flat amount regardless of base", () => {
    expect(computeCommissionAmount({ baseAmount: 0, rate: 0, type: "fixed", fixed: 5000 })).toBe(5000);
    expect(computeCommissionAmount({ baseAmount: 99999, rate: 99, type: "fixed", fixed: 5000 })).toBe(5000);
  });

  it("returns 0 for zero/negative base or rate on percentage", () => {
    expect(computeCommissionAmount({ baseAmount: 0, rate: 10, type: "percentage", fixed: 0 })).toBe(0);
    expect(computeCommissionAmount({ baseAmount: 24800, rate: 0, type: "percentage", fixed: 0 })).toBe(0);
    expect(computeCommissionAmount({ baseAmount: -100, rate: 10, type: "percentage", fixed: 0 })).toBe(0);
  });

  it("never returns a negative amount", () => {
    expect(computeCommissionAmount({ baseAmount: 1000, rate: -5, type: "percentage", fixed: 0 })).toBe(0);
    expect(computeCommissionAmount({ baseAmount: 0, rate: 0, type: "fixed", fixed: -100 })).toBe(0);
  });
});

describe("PRECONTRACT_STATUSES", () => {
  it("covers the pre-contract referral states and excludes terminal/contracted", () => {
    expect(PRECONTRACT_STATUSES).toEqual(["pending", "contacted", "in_negotiation", "trial"]);
    expect(PRECONTRACT_STATUSES).not.toContain("contracted");
    expect(PRECONTRACT_STATUSES).not.toContain("cancelled");
    expect(PRECONTRACT_STATUSES).not.toContain("churned");
  });
});
