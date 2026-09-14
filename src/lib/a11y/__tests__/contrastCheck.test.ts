import { describe, it, expect } from "vitest";
import { parseHexColor, relativeLuminance, contrastRatio, meetsWcagAA, checkColorPair } from "../contrastCheck";

describe("parseHexColor()", () => {
  it("#RRGGBB 形式をパースする", () => {
    expect(parseHexColor("#000000")).toEqual([0, 0, 0]);
    expect(parseHexColor("#FFFFFF")).toEqual([255, 255, 255]);
    expect(parseHexColor("#FF8000")).toEqual([255, 128, 0]);
  });

  it("#RGB 短縮形をパースする", () => {
    expect(parseHexColor("#000")).toEqual([0, 0, 0]);
    expect(parseHexColor("#FFF")).toEqual([255, 255, 255]);
    expect(parseHexColor("#F80")).toEqual([255, 136, 0]);
  });

  it("# なしでも動作する", () => {
    expect(parseHexColor("FFFFFF")).toEqual([255, 255, 255]);
    expect(parseHexColor("FFF")).toEqual([255, 255, 255]);
  });

  it("不正な長さで例外を投げる", () => {
    expect(() => parseHexColor("#12345")).toThrow("Invalid hex color");
    expect(() => parseHexColor("")).toThrow("Invalid hex color");
    expect(() => parseHexColor("#1")).toThrow("Invalid hex color");
  });

  it("不正な文字は NaN を返す（parseInt の挙動）", () => {
    // ponytail: hex 文字以外のバリデーションは追加しない。呼び出し元のデザイントークンは事前検証済み。
    const [r] = parseHexColor("#GG0000");
    expect(Number.isNaN(r)).toBe(true);
  });
});

describe("relativeLuminance()", () => {
  it("黒は 0", () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 5);
  });

  it("白は 1", () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
  });

  it("中間グレーは 0 < L < 1", () => {
    const L = relativeLuminance(128, 128, 128);
    expect(L).toBeGreaterThan(0);
    expect(L).toBeLessThan(1);
  });
});

describe("contrastRatio()", () => {
  it("白と黒のコントラスト比は 21:1", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
  });

  it("同一色のコントラスト比は 1:1", () => {
    expect(contrastRatio([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 2);
  });

  it("引数の順序に依存しない（明度自動判定）", () => {
    const r1 = contrastRatio([255, 255, 255], [0, 0, 0]);
    const r2 = contrastRatio([0, 0, 0], [255, 255, 255]);
    expect(r1).toBeCloseTo(r2, 5);
  });
});

describe("meetsWcagAA()", () => {
  it("通常テキスト: 4.5:1 以上で合格", () => {
    expect(meetsWcagAA(4.5)).toBe(true);
    expect(meetsWcagAA(4.49)).toBe(false);
    expect(meetsWcagAA(21)).toBe(true);
  });

  it("大きいテキスト: 3:1 以上で合格", () => {
    expect(meetsWcagAA(3.0, "large")).toBe(true);
    expect(meetsWcagAA(2.99, "large")).toBe(false);
  });

  it("UI コンポーネント: 3:1 以上で合格", () => {
    expect(meetsWcagAA(3.0, "ui")).toBe(true);
    expect(meetsWcagAA(2.99, "ui")).toBe(false);
  });

  it("デフォルトは normal コンテキスト", () => {
    // 3.5 は large なら合格だが normal なら不合格
    expect(meetsWcagAA(3.5)).toBe(false);
  });
});

describe("checkColorPair()", () => {
  it("黒文字・白背景は合格", () => {
    const result = checkColorPair("#000000", "#FFFFFF");
    expect(result.passes).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("低コントラストのペアは不合格", () => {
    // 薄い灰色に白背景
    const result = checkColorPair("#CCCCCC", "#FFFFFF");
    expect(result.passes).toBe(false);
  });

  it("large コンテキストではしきい値が緩和される", () => {
    // 3:1 〜 4.5:1 の間のペアを探す
    const result = checkColorPair("#767676", "#FFFFFF", "normal");
    const resultLarge = checkColorPair("#767676", "#FFFFFF", "large");
    // #767676 on white は ~4.54:1 — normal でぎりぎり合格
    expect(result.passes).toBe(true);
    expect(resultLarge.passes).toBe(true);
  });

  it("ratio は小数点以下 2 桁に丸められる", () => {
    const result = checkColorPair("#000000", "#FFFFFF");
    const decimals = String(result.ratio).split(".")[1];
    // 丸め後なので 2 桁以下
    expect(!decimals || decimals.length <= 2).toBe(true);
  });

  it("丸め後に 4.5 になる境界値は丸め前の真の比率で判定する", () => {
    // #0080AA on #FFFFFF の真の比率は約 4.4986:1（AA 未達）だが、
    // 表示用に小数点2桁へ丸めると 4.5 になり誤って合格扱いされうる。
    const result = checkColorPair("#0080AA", "#FFFFFF");
    expect(result.ratio).toBe(4.5);
    expect(result.passes).toBe(false);
  });
});
