import { describe, it, expect } from "vitest";
import { deriveTaxRateFromSquareAmounts, mapSquareLineItems } from "./squareReceipt";

describe("deriveTaxRateFromSquareAmounts", () => {
  it("derives standard 10% rate", () => {
    expect(deriveTaxRateFromSquareAmounts(1100, 100)).toBe(10);
  });

  it("derives reduced 8% rate", () => {
    expect(deriveTaxRateFromSquareAmounts(1080, 80)).toBe(8);
  });

  it("treats tax_amount=0 as tax-exempt (0%), not a fallback to 10%", () => {
    expect(deriveTaxRateFromSquareAmounts(1000, 0)).toBe(0);
  });

  it("falls back to 10% only for degenerate totals", () => {
    expect(deriveTaxRateFromSquareAmounts(0, 0)).toBe(0);
    expect(deriveTaxRateFromSquareAmounts(50, 100)).toBe(10);
  });
});

describe("mapSquareLineItems", () => {
  it("carries the exact Square line total as unit_price with quantity=1 (no rounding drift)", () => {
    const items = mapSquareLineItems([{ name: "洗車", quantity: "3", total_money: { amount: 1000 } }], 10);
    expect(items).toEqual([{ description: "洗車（数量: 3）", quantity: 1, unit_price: 1000, tax_category: 10 }]);
  });

  it("falls back to base_price_money when total_money is absent", () => {
    const items = mapSquareLineItems(
      [{ name: "コーティング", quantity: "1", base_price_money: { amount: 33000 } }],
      10,
    );
    expect(items).toEqual([{ description: "コーティング", quantity: 1, unit_price: 33000, tax_category: 10 }]);
  });
});
