import { describe, it, expect } from "vitest";
import { pickImagesToClassify, aiStageToCertStage, type StageImageRow } from "../photoStageClassify";

describe("pickImagesToClassify", () => {
  const rows: StageImageRow[] = [
    { id: "a", stage: "unspecified" },
    { id: "b", stage: "intake_before" }, // 手動タグ済み
    { id: "c", stage: null }, // 未設定 = 対象
    { id: "d", stage: "after" }, // 手動タグ済み
    { id: "e", stage: "" }, // 空 = 対象
  ];

  it("未タグ (unspecified/null/空) の画像だけを対象にする", () => {
    expect(pickImagesToClassify(rows, {}, 10)).toEqual(["a", "c", "e"]);
  });

  it("既に提案済みの画像はスキップする", () => {
    expect(pickImagesToClassify(rows, { a: { stage: "after" } }, 10)).toEqual(["c", "e"]);
  });

  it("上限 max を超えない", () => {
    expect(pickImagesToClassify(rows, {}, 2)).toEqual(["a", "c"]);
  });

  it("対象がなければ空配列", () => {
    expect(pickImagesToClassify([{ id: "x", stage: "after" }], {}, 10)).toEqual([]);
  });
});

describe("aiStageToCertStage", () => {
  it("before → intake_before, after → after", () => {
    expect(aiStageToCertStage("before")).toBe("intake_before");
    expect(aiStageToCertStage("after")).toBe("after");
  });
  it("other は提案しない (null)", () => {
    expect(aiStageToCertStage("other")).toBeNull();
  });
});
