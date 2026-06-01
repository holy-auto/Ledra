import { describe, it, expect } from "vitest";
import {
  effectiveUnitPrice,
  isOutOfStock,
  selectSourcingOption,
  type PartnerSourcingOption,
} from "../reorderSelection";

function opt(p: Partial<PartnerSourcingOption>): PartnerSourcingOption {
  return {
    partnerId: "p",
    partnerProductId: "pp",
    sku: "SKU-1",
    priority: 100,
    listPrice: 1000,
    priceOverride: null,
    leadTimeDays: 5,
    stockStatus: null,
    ...p,
  };
}

describe("effectiveUnitPrice (#2 店舗別卸値上書き)", () => {
  it("uses the override when present", () => {
    expect(effectiveUnitPrice({ listPrice: 1000, priceOverride: 800 })).toBe(800);
  });
  it("falls back to list price when no override", () => {
    expect(effectiveUnitPrice({ listPrice: 1000, priceOverride: null })).toBe(1000);
  });
  it("allows a 0 override (free / 特価)", () => {
    expect(effectiveUnitPrice({ listPrice: 1000, priceOverride: 0 })).toBe(0);
  });
  it("ignores a negative override", () => {
    expect(effectiveUnitPrice({ listPrice: 1000, priceOverride: -5 })).toBe(1000);
  });
  it("returns null when neither is set", () => {
    expect(effectiveUnitPrice({ listPrice: null, priceOverride: null })).toBeNull();
  });
});

describe("isOutOfStock", () => {
  it("detects common out-of-stock markers", () => {
    for (const s of ["out", "OUT_OF_STOCK", "在庫なし", "欠品", "品切れ"]) {
      expect(isOutOfStock(s)).toBe(true);
    }
  });
  it("treats null/empty/other as in stock", () => {
    expect(isOutOfStock(null)).toBe(false);
    expect(isOutOfStock("在庫あり")).toBe(false);
    expect(isOutOfStock("low")).toBe(false);
  });
});

describe("selectSourcingOption (#3 優先度選定)", () => {
  it("returns null for no candidates", () => {
    expect(selectSourcingOption([])).toBeNull();
  });

  it("excludes out-of-stock partners", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "a", priority: 1, stockStatus: "在庫なし" }),
      opt({ partnerId: "b", priority: 50 }),
    ]);
    expect(r?.partnerId).toBe("b");
  });

  it("prefers lower priority value first", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "a", priority: 100, listPrice: 500 }),
      opt({ partnerId: "b", priority: 10, listPrice: 900 }),
    ]);
    expect(r?.partnerId).toBe("b"); // priority wins over price
  });

  it("breaks priority ties by effective price (override aware)", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "a", priority: 100, listPrice: 1000, priceOverride: null }),
      opt({ partnerId: "b", priority: 100, listPrice: 1200, priceOverride: 700 }), // 700 効く
    ]);
    expect(r?.partnerId).toBe("b");
  });

  it("breaks price ties by lead time", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "a", priority: 100, listPrice: 1000, leadTimeDays: 7 }),
      opt({ partnerId: "b", priority: 100, listPrice: 1000, leadTimeDays: 2 }),
    ]);
    expect(r?.partnerId).toBe("b");
  });

  it("deprioritizes null price / null lead time", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "a", priority: 100, listPrice: null }),
      opt({ partnerId: "b", priority: 100, listPrice: 1500 }),
    ]);
    expect(r?.partnerId).toBe("b");
  });

  it("is deterministic on full ties (partnerId tie-break)", () => {
    const r = selectSourcingOption([
      opt({ partnerId: "z", priority: 100, listPrice: 1000, leadTimeDays: 3 }),
      opt({ partnerId: "a", priority: 100, listPrice: 1000, leadTimeDays: 3 }),
    ]);
    expect(r?.partnerId).toBe("a");
  });
});
