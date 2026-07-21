import { describe, it, expect } from "vitest";
import { sanitizeSizePrices, priceForVehicleSize, normalizeMenuSizePricing } from "@/lib/menu/sizePricing";
import { resolveSizeClassFromText } from "@/lib/ai/automation/quoteReplyAuto";

describe("sanitizeSizePrices", () => {
  it("vehicle_size: SS〜XL の正の整数のみ採用、不正キー/値は落とす", () => {
    expect(
      sanitizeSizePrices("vehicle_size", { SS: 8000, M: 10000, XL: "16000", bogus: 999, S: 0, L: -1, LL: 1.5 }),
    ).toEqual({ SS: 8000, M: 10000, XL: 16000 });
  });
  it("wheel_size: 2桁インチ(10〜30)のみ採用", () => {
    expect(sanitizeSizePrices("wheel_size", { "18": 7000, "9": 100, "31": 100, "18.5": 1, "20": 9000 })).toEqual({
      "18": 7000,
      "20": 9000,
    });
  });
  it("妥当な段が無ければ null", () => {
    expect(sanitizeSizePrices("vehicle_size", { foo: 1 })).toBeNull();
    expect(sanitizeSizePrices("vehicle_size", null)).toBeNull();
  });
});

describe("priceForVehicleSize", () => {
  const prices = { SS: 8000, M: 10000, LL: 14000 };
  it("完全一致を返す", () => {
    expect(priceForVehicleSize(prices, "M")).toBe(10000);
    expect(priceForVehicleSize(prices, "ss")).toBe(8000); // 大文字化
  });
  it("未登録段は近い下の段→上の段で補完", () => {
    expect(priceForVehicleSize(prices, "S")).toBe(8000); // S→SS(下)
    expect(priceForVehicleSize(prices, "L")).toBe(10000); // L→M(下)
    expect(priceForVehicleSize(prices, "XL")).toBe(14000); // XL→LL(下)
  });
  it("size_class 不明/空表は null (呼び出し側でフォールバック)", () => {
    expect(priceForVehicleSize(prices, null)).toBeNull();
    expect(priceForVehicleSize(prices, "UNKNOWN")).toBeNull();
    expect(priceForVehicleSize({}, "M")).toBeNull();
  });
});

describe("normalizeMenuSizePricing", () => {
  it("未知/未指定の軸は単一単価扱い", () => {
    expect(normalizeMenuSizePricing(null, { SS: 1 })).toEqual({ size_axis: null, size_prices: null });
    expect(normalizeMenuSizePricing("bogus", { SS: 1 })).toEqual({ size_axis: null, size_prices: null });
  });
  it("妥当な段が1つも無ければ軸ごと落とす", () => {
    expect(normalizeMenuSizePricing("vehicle_size", { bad: 1 })).toEqual({ size_axis: null, size_prices: null });
  });
  it("妥当なら軸と正規化した表を返す", () => {
    expect(normalizeMenuSizePricing("vehicle_size", { M: "10000", bad: 1 })).toEqual({
      size_axis: "vehicle_size",
      size_prices: { M: 10000 },
    });
  });
});

describe("resolveSizeClassFromText", () => {
  const master = [
    { maker: "トヨタ", model: "アルファード", size_class: "LL" },
    { maker: "トヨタ", model: "ハイエース", size_class: "L" },
    { maker: "スズキ", model: "アルト", size_class: "SS" },
  ];
  it("テキストに含まれる車種の size_class を返す", () => {
    expect(resolveSizeClassFromText("アルファードのコーティング", master)).toBe("LL");
    expect(resolveSizeClassFromText("ハイエース 2026年式", master)).toBe("L");
  });
  it("最長一致を優先する (アルファード > アルト)", () => {
    // "アルファード" は "アルト" を含まないが、両方部分一致し得るテキストで最長を選ぶ
    expect(resolveSizeClassFromText("アルファード", master)).toBe("LL");
  });
  it("該当なし/空は null", () => {
    expect(resolveSizeClassFromText("該当しない車種", master)).toBeNull();
    expect(resolveSizeClassFromText("", master)).toBeNull();
    expect(resolveSizeClassFromText("アルト", null)).toBeNull();
  });
});
