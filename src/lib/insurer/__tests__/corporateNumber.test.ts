import { describe, it, expect } from "vitest";
import { isValidCorporateNumber } from "../corporateNumber";

describe("isValidCorporateNumber — 国税庁チェックディジット", () => {
  // 回帰防止: 重み付けが逆だと実在の法人番号を全て弾き、法人番号照会が
  // 常に「見つかりませんでした」になり登録も通らなくなる (国税庁の式は
  // 最下位桁=1桁目を奇数として重み1、偶数桁を重み2)。
  it.each([
    "6040001080734", // 株式会社HOLY
    "1180301018771", // トヨタ自動車株式会社
    "7000012050002", // 国税庁
  ])("実在の法人番号 %s を有効と判定する", (n) => {
    expect(isValidCorporateNumber(n)).toBe(true);
  });

  it("チェックディジットが1桁違うと無効", () => {
    expect(isValidCorporateNumber("5040001080734")).toBe(false);
  });

  it("13桁でない/数字以外は無効", () => {
    expect(isValidCorporateNumber("123")).toBe(false);
    expect(isValidCorporateNumber("60400010807ab")).toBe(false);
  });

  it("ハイフン・空白は除去して判定", () => {
    expect(isValidCorporateNumber("6-0400-0108-0734")).toBe(true);
  });
});
