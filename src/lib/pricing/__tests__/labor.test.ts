import { describe, expect, it } from "vitest";
import { calcLaborPrice } from "../labor";

describe("calcLaborPrice (標準工数 × レバーレート)", () => {
  it("工数 × レバーレート で工賃を算出する", () => {
    expect(calcLaborPrice(1.2, 9000)).toBe(10800);
    expect(calcLaborPrice(0.5, 8000)).toBe(4000);
    expect(calcLaborPrice(2, 10000)).toBe(20000);
  });

  it("端数は四捨五入する", () => {
    expect(calcLaborPrice(0.3, 9500)).toBe(2850);
    expect(calcLaborPrice(0.7, 9999)).toBe(6999); // 6999.3 → 6999
    expect(calcLaborPrice(1.15, 8770)).toBe(10086); // 10085.5 → 10086
  });

  it("工数が未設定・0 以下なら null（算出不能）", () => {
    expect(calcLaborPrice(null, 9000)).toBeNull();
    expect(calcLaborPrice(undefined, 9000)).toBeNull();
    expect(calcLaborPrice(0, 9000)).toBeNull();
    expect(calcLaborPrice(-1, 9000)).toBeNull();
  });

  it("レバーレートが未設定・0 以下なら null（算出不能）", () => {
    expect(calcLaborPrice(1.2, null)).toBeNull();
    expect(calcLaborPrice(1.2, undefined)).toBeNull();
    expect(calcLaborPrice(1.2, 0)).toBeNull();
    expect(calcLaborPrice(1.2, -100)).toBeNull();
  });

  it("非有限値は null", () => {
    expect(calcLaborPrice(NaN, 9000)).toBeNull();
    expect(calcLaborPrice(1.2, Infinity)).toBeNull();
  });
});
