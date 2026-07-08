import { describe, expect, it } from "vitest";
import { normalizePostalCode } from "@/lib/address/postalLookup";

describe("normalizePostalCode", () => {
  it("7桁の数字はそのまま返す", () => {
    expect(normalizePostalCode("1234567")).toBe("1234567");
  });

  it("ハイフン付きを正規化する", () => {
    expect(normalizePostalCode("123-4567")).toBe("1234567");
  });

  it("全角数字を半角に変換する", () => {
    expect(normalizePostalCode("１２３-４５６７")).toBe("1234567");
  });

  it("7桁に満たない入力は null", () => {
    expect(normalizePostalCode("123-456")).toBeNull();
    expect(normalizePostalCode("")).toBeNull();
  });

  it("8桁以上は null (誤入力を補完しない)", () => {
    expect(normalizePostalCode("12345678")).toBeNull();
  });

  it("数字以外のみの入力は null", () => {
    expect(normalizePostalCode("東京都")).toBeNull();
  });

  it("数字混入 (前後に文字) は null (collapse-and-count で通していた過剰許容)", () => {
    expect(normalizePostalCode("abc1234567xyz")).toBeNull();
    expect(normalizePostalCode("12 34567")).toBeNull();
  });
});
