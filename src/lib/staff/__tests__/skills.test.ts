import { describe, it, expect } from "vitest";
import { inferJobSkillTags, skillMatchScore, isSkillMatch } from "../skills";

describe("inferJobSkillTags", () => {
  it("picks up skill keywords from the job text", () => {
    const tags = inferJobSkillTags("ガラスコーティング 全面施工");
    expect(tags).toContain("ガラスコーティング");
    // 「コーティング」も部分一致で拾う
    expect(tags).toContain("コーティング");
  });

  it("maps service_type to skills", () => {
    const tags = inferJobSkillTags("", "ppf");
    expect(tags).toEqual(expect.arrayContaining(["PPF", "プロテクションフィルム"]));
  });

  it("is case-insensitive for ascii keywords", () => {
    expect(inferJobSkillTags("ppf 施工")).toContain("PPF");
  });

  it("returns empty for unrelated text", () => {
    expect(inferJobSkillTags("洗車のみ", null)).toEqual([]);
  });

  it("dedupes overlapping sources", () => {
    const tags = inferJobSkillTags("PPF", "ppf");
    expect(tags.filter((t) => t === "PPF")).toHaveLength(1);
  });
});

describe("skillMatchScore", () => {
  it("counts exact matches", () => {
    expect(skillMatchScore(["PPF"], ["PPF", "プロテクションフィルム"])).toBe(1);
  });

  it("matches via substring containment (either direction)", () => {
    expect(skillMatchScore(["コーティング"], ["ガラスコーティング"])).toBe(1);
    expect(skillMatchScore(["ガラスコーティング"], ["コーティング"])).toBe(1);
  });

  it("counts each matching staff skill once", () => {
    expect(skillMatchScore(["PPF", "磨き"], ["PPF"])).toBe(1);
    expect(skillMatchScore(["PPF", "コーティング"], ["PPF", "ガラスコーティング"])).toBe(2);
  });

  it("returns 0 for no overlap or empty inputs", () => {
    expect(skillMatchScore(["磨き"], ["PPF"])).toBe(0);
    expect(skillMatchScore([], ["PPF"])).toBe(0);
    expect(skillMatchScore(["PPF"], [])).toBe(0);
    expect(skillMatchScore(null, null)).toBe(0);
  });
});

describe("isSkillMatch", () => {
  it("is true when score > 0", () => {
    expect(isSkillMatch(["PPF"], ["PPF"])).toBe(true);
    expect(isSkillMatch(["PPF"], ["コーティング"])).toBe(false);
  });
});
