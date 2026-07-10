import { describe, it, expect } from "vitest";
import { calcItems } from "./calcItems";

describe("calcItems", () => {
  it("computes subtotal/tax from tax-exclusive items (default mode)", () => {
    const { subtotal, tax, total } = calcItems(
      [{ description: "工賃", quantity: 1, unit_price: 1000, tax_category: 10 }],
      10,
      false,
    );
    expect(subtotal).toBe(1000);
    expect(tax).toBe(100);
    expect(total).toBe(1100);
  });

  it("reverse-derives subtotal/tax from tax-inclusive items (Square receipt mode)", () => {
    // Square 側の売上は税込金額のため、is_tax_inclusive=true で逆算する。
    const { subtotal, tax, total, taxBreakdown } = calcItems(
      [{ description: "洗車", quantity: 1, unit_price: 1100 }],
      10,
      true,
    );
    expect(total).toBe(1100);
    expect(subtotal).toBe(1000);
    expect(tax).toBe(100);
    expect(taxBreakdown).toEqual([{ rate: 10, subtotal: 1000, tax: 100 }]);
  });

  it("sums multiple tax-inclusive line items to match the Square order total", () => {
    const { total } = calcItems(
      [
        { description: "コーティング", quantity: 1, unit_price: 33000 },
        { description: "室内清掃", quantity: 1, unit_price: 5500 },
      ],
      10,
      true,
    );
    expect(total).toBe(38500);
  });
});
