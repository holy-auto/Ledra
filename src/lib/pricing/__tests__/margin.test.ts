import { describe, expect, it } from "vitest";
import { calcMarginRate, calcSellingPrice } from "../margin";

describe("calcSellingPrice (マークアップ率方式)", () => {
  it("原価 × (1 + 利益率%) で提供価格を算出する", () => {
    expect(calcSellingPrice(1000, 30)).toBe(1300);
    expect(calcSellingPrice(500, 20)).toBe(600);
    expect(calcSellingPrice(10000, 0)).toBe(10000);
  });

  it("小数の利益率を四捨五入する", () => {
    expect(calcSellingPrice(1000, 15.5)).toBe(1155);
    expect(calcSellingPrice(333, 33.33)).toBe(444); // 333 * 1.3333 = 443.9889 → 444
  });

  it("利益率が null/undefined の場合は原価をそのまま返す", () => {
    expect(calcSellingPrice(1000, null)).toBe(1000);
    expect(calcSellingPrice(1000, undefined)).toBe(1000);
  });

  it("原価が 0 や負値の場合は 0 を返す", () => {
    expect(calcSellingPrice(0, 30)).toBe(0);
    expect(calcSellingPrice(-100, 30)).toBe(0);
  });

  it("負の利益率（赤字販売）も計算できる", () => {
    expect(calcSellingPrice(1000, -20)).toBe(800);
  });
});

describe("calcMarginRate (逆算)", () => {
  it("提供価格と原価から利益率を逆算する", () => {
    expect(calcMarginRate(1000, 1300)).toBe(30);
    expect(calcMarginRate(500, 600)).toBe(20);
  });

  it("原価が 0 の場合は null を返す", () => {
    expect(calcMarginRate(0, 1000)).toBeNull();
  });

  it("赤字（提供価格 < 原価）の場合は負の値を返す", () => {
    expect(calcMarginRate(1000, 800)).toBe(-20);
  });
});
