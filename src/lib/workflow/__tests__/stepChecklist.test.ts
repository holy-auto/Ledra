import { describe, it, expect } from "vitest";
import { normalizeGuideList, hasStepGuide, computeStepGuideState } from "../stepChecklist";

describe("normalizeGuideList", () => {
  it("trims, drops empties/blanks, dedupes, preserves first-seen order", () => {
    expect(normalizeGuideList(["  交換前 ", "交換前", "", "   ", "新旧部品"])).toEqual(["交換前", "新旧部品"]);
  });

  it("handles null/undefined", () => {
    expect(normalizeGuideList(null)).toEqual([]);
    expect(normalizeGuideList(undefined)).toEqual([]);
  });
});

describe("hasStepGuide", () => {
  it("is true when photos or checks are present, false otherwise", () => {
    expect(hasStepGuide({ required_photos: ["交換前"] })).toBe(true);
    expect(hasStepGuide({ checklist: ["電圧測定"] })).toBe(true);
    expect(hasStepGuide({})).toBe(false);
    // 空白のみは実質ガイド無し扱い
    expect(hasStepGuide({ required_photos: ["   "], checklist: [] })).toBe(false);
  });
});

describe("computeStepGuideState", () => {
  it("no guide → satisfied (existing steps stay unaffected)", () => {
    const s = computeStepGuideState({});
    expect(s.total).toBe(0);
    expect(s.outstanding).toBe(0);
    expect(s.allSatisfied).toBe(true);
    expect(s.photos).toEqual([]);
    expect(s.checks).toEqual([]);
  });

  it("counts outstanding across photos and checks, marking confirmed ones done", () => {
    const s = computeStepGuideState(
      { required_photos: ["交換前", "取付後"], checklist: ["電圧測定"] },
      { photos: ["交換前"] },
    );
    expect(s.total).toBe(3);
    expect(s.outstanding).toBe(2); // 取付後 + 電圧測定
    expect(s.allSatisfied).toBe(false);
    expect(s.photos.find((p) => p.label === "交換前")?.done).toBe(true);
    expect(s.photos.find((p) => p.label === "取付後")?.done).toBe(false);
    expect(s.checks[0]?.done).toBe(false);
  });

  it("all confirmed → satisfied", () => {
    const s = computeStepGuideState(
      { required_photos: ["交換前"], checklist: ["電圧測定"] },
      { photos: ["交換前"], checks: ["電圧測定"] },
    );
    expect(s.outstanding).toBe(0);
    expect(s.allSatisfied).toBe(true);
  });

  it("confirming an unknown label does not go negative", () => {
    const s = computeStepGuideState({ required_photos: ["交換前"] }, { photos: ["存在しない"] });
    expect(s.outstanding).toBe(1);
    expect(s.allSatisfied).toBe(false);
  });
});
