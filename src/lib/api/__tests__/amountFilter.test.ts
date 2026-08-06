import { describe, it, expect } from "vitest";
import { parseAmountParam } from "../amountFilter";

describe("parseAmountParam", () => {
  it("未指定（null/undefined/空文字/空白）は null（フィルタ無し）", () => {
    // これが 0 を返すと total=0 で絞り込み全帳票が消える（本番不具合の再発防止）
    expect(parseAmountParam(null)).toBeNull();
    expect(parseAmountParam(undefined)).toBeNull();
    expect(parseAmountParam("")).toBeNull();
    expect(parseAmountParam("   ")).toBeNull();
  });

  it("明示的な 0 は 0（フィルタ有り）", () => {
    expect(parseAmountParam("0")).toBe(0);
  });

  it("正の数値は整数に切り捨て", () => {
    expect(parseAmountParam("100")).toBe(100);
    expect(parseAmountParam("1500.9")).toBe(1500);
  });

  it("負数・非数値は null", () => {
    expect(parseAmountParam("-1")).toBeNull();
    expect(parseAmountParam("abc")).toBeNull();
    expect(parseAmountParam("NaN")).toBeNull();
  });
});
