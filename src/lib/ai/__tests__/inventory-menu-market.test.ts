import { describe, it, expect } from "vitest";
import { suggestPosDeductions } from "../posInventoryDeduction";
import { calculatePriceBand } from "../menuPriceEstimate";
import { translationCacheKey, SUPPORTED_LANGUAGES } from "../translateContent";

describe("suggestPosDeductions", () => {
  it("uses link rows verbatim with confidence 1.0", async () => {
    const out = await suggestPosDeductions({
      sales: [{ menu_item_id: "m1", menu_item_name: "ガラスコート", service_category: "coating", sold_quantity: 2 }],
      skus: [{ id: "sku1", name: "Crystal Pro 9H" }],
      links: [{ menu_item_id: "m1", sku_id: "sku1", quantity: 50 }],
      history: [],
    });
    expect(out.suggestions).toEqual([
      expect.objectContaining({ menu_item_id: "m1", sku_id: "sku1", quantity: 100, method: "link", confidence: 1.0 }),
    ]);
  });

  it("falls back to history when no link exists", async () => {
    const out = await suggestPosDeductions({
      sales: [{ menu_item_id: "m2", menu_item_name: "PPF 全面", service_category: "ppf", sold_quantity: 1 }],
      skus: [{ id: "sku2", name: "PPF Film 1.5m" }],
      links: [],
      history: [{ service_category: "ppf", sku_id: "sku2", avg_quantity: 8 }],
    });
    expect(out.suggestions[0]).toMatchObject({
      sku_id: "sku2",
      method: "history",
    });
    expect(out.suggestions[0].quantity).toBeCloseTo(8);
  });

  it("returns no suggestion when nothing is linked and no history matches", async () => {
    const out = await suggestPosDeductions({
      sales: [{ menu_item_id: "m3", menu_item_name: "未登録メニュー", sold_quantity: 1 }],
      skus: [{ id: "sku-x", name: "X" }],
      links: [],
      history: [],
    });
    expect(out.suggestions).toEqual([]);
  });
});

describe("calculatePriceBand", () => {
  it("returns the median + size multiplier when sales are present", () => {
    const out = calculatePriceBand({
      menuName: "ガラスコート",
      vehicleSize: "L",
      ownSales: [50000, 60000, 70000],
    });
    // p50 = 60000 * 1.15 = 69000
    expect(out.band.p50).toBe(60000);
    expect(out.baseline).toBe(69000);
  });

  it("falls back to marketMedian when no own sales", () => {
    const out = calculatePriceBand({
      menuName: "未経験",
      vehicleSize: "M",
      ownSales: [],
      marketMedian: 50000,
    });
    expect(out.baseline).toBe(55000); // 50k * 1.10
  });

  it("returns 0 baseline when nothing is available", () => {
    const out = calculatePriceBand({ menuName: "?", ownSales: [], marketMedian: null });
    expect(out.baseline).toBe(0);
  });
});

describe("translationCacheKey", () => {
  it("returns the same key for the same input", () => {
    expect(translationCacheKey("hello", "en")).toBe(translationCacheKey("hello", "en"));
  });

  it("differs when the language changes", () => {
    expect(translationCacheKey("hello", "en")).not.toBe(translationCacheKey("hello", "zh"));
  });

  it("differs when the tone changes", () => {
    expect(translationCacheKey("hello", "en", "formal")).not.toBe(translationCacheKey("hello", "en", "casual"));
  });

  it("exposes the supported languages", () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.key)).toEqual(["en", "zh", "vi", "ko", "pt-BR"]);
  });
});
