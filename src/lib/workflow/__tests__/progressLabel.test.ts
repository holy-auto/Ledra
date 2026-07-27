import { describe, it, expect } from "vitest";
import { resolveProgressLabel, templateStepLabel } from "../progressLabel";

describe("resolveProgressLabel", () => {
  it("明示ラベルが最優先", () => {
    expect(
      resolveProgressLabel({ explicit: "上塗り塗装", stepLogLabel: "下地処理", templateStepLabel: "マスキング" }),
    ).toBe("上塗り塗装");
  });

  it("明示なし → 工程ログの step_label を採用", () => {
    expect(resolveProgressLabel({ explicit: "", stepLogLabel: "下地処理", templateStepLabel: "マスキング" })).toBe(
      "下地処理",
    );
  });

  it("明示・ログなし → テンプレート工程 label を採用", () => {
    expect(resolveProgressLabel({ explicit: null, stepLogLabel: null, templateStepLabel: "マスキング" })).toBe(
      "マスキング",
    );
  });

  it("すべて無し → 進捗更新にフォールバック", () => {
    expect(resolveProgressLabel({})).toBe("進捗更新");
    expect(resolveProgressLabel({ explicit: "   " })).toBe("進捗更新");
  });
});

describe("templateStepLabel", () => {
  const steps = [
    { order: 0, key: "intake", label: "入庫点検" },
    { order: 1, key: "mask", label: "マスキング" },
    { order: 2, key: "paint", label: "上塗り塗装" },
  ];

  it("order 一致の label を返す", () => {
    expect(templateStepLabel(steps, 1)).toBe("マスキング");
  });

  it("一致なし・不正入力は null", () => {
    expect(templateStepLabel(steps, 9)).toBeNull();
    expect(templateStepLabel(steps, null)).toBeNull();
    expect(templateStepLabel(null, 1)).toBeNull();
    expect(templateStepLabel([{ order: 1 }], 1)).toBeNull(); // label 無し
  });
});
