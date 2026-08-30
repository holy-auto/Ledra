import { describe, it, expect } from "vitest";
import { computeEvidenceProgress, type RequiredShot } from "../evidenceProgress";

const BASIC_REQUIRED: RequiredShot[] = [
  { stage: "intake_before", label: "施工前の全体写真" },
  { stage: "after", label: "施工後の全体写真" },
];

describe("computeEvidenceProgress", () => {
  it("returns complete when all required shots are fulfilled", () => {
    const result = computeEvidenceProgress(BASIC_REQUIRED, ["intake_before", "after"]);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(2);
    expect(result.fulfilled).toBe(2);
    expect(result.missing).toHaveLength(0);
  });

  it("returns missing items when shots are unfulfilled", () => {
    const result = computeEvidenceProgress(BASIC_REQUIRED, ["intake_before"]);
    expect(result.complete).toBe(false);
    expect(result.fulfilled).toBe(1);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].stage).toBe("after");
  });

  it("returns all missing when no photos uploaded", () => {
    const result = computeEvidenceProgress(BASIC_REQUIRED, []);
    expect(result.complete).toBe(false);
    expect(result.fulfilled).toBe(0);
    expect(result.missing).toHaveLength(2);
  });

  it("handles minCount > 1", () => {
    const required: RequiredShot[] = [{ stage: "intake_before", label: "施工前写真", minCount: 3 }];
    // 2 枚: 不足
    const r1 = computeEvidenceProgress(required, ["intake_before", "intake_before"]);
    expect(r1.complete).toBe(false);
    expect(r1.items[0].uploaded).toBe(2);
    expect(r1.items[0].required).toBe(3);

    // 3 枚: 充足
    const r2 = computeEvidenceProgress(required, ["intake_before", "intake_before", "intake_before"]);
    expect(r2.complete).toBe(true);
  });

  it("counts extra photos beyond requirement", () => {
    const result = computeEvidenceProgress(BASIC_REQUIRED, [
      "intake_before",
      "intake_before",
      "after",
      "after",
      "after",
    ]);
    expect(result.complete).toBe(true);
    expect(result.items[0].uploaded).toBe(2);
    expect(result.items[1].uploaded).toBe(3);
  });

  it("ignores uploaded stages that are not in required list", () => {
    const result = computeEvidenceProgress(BASIC_REQUIRED, ["intake_before", "in_progress", "unspecified", "after"]);
    expect(result.complete).toBe(true);
    // in_progress and unspecified are just ignored
    expect(result.fulfilled).toBe(2);
  });

  it("returns empty progress for empty required list", () => {
    const result = computeEvidenceProgress([], ["intake_before", "after"]);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("defaults minCount to 1", () => {
    const required: RequiredShot[] = [{ stage: "after", label: "施工後" }];
    const result = computeEvidenceProgress(required, ["after"]);
    expect(result.complete).toBe(true);
    expect(result.items[0].required).toBe(1);
  });

  it("does not let one photo satisfy two required shots sharing the same stage", () => {
    const required: RequiredShot[] = [
      { stage: "intake_before", label: "施工前の全体写真" },
      { stage: "intake_before", label: "傷口の接写" },
    ];
    // 1枚しかアップロードされていない → 片方しか満たせない
    const result = computeEvidenceProgress(required, ["intake_before"]);
    expect(result.complete).toBe(false);
    expect(result.fulfilled).toBe(1);
    expect(result.items[0].fulfilled).toBe(true);
    expect(result.items[1].fulfilled).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].label).toBe("傷口の接写");

    // 2枚あれば両方満たせる
    const both = computeEvidenceProgress(required, ["intake_before", "intake_before"]);
    expect(both.complete).toBe(true);
  });
});
