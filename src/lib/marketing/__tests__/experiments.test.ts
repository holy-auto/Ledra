import { describe, it, expect } from "vitest";
import { assignVariant, hashString, EXPERIMENTS, type Variant } from "../experiments";

describe("experiments 割当ロジック", () => {
  it("hashString は決定的（同入力→同出力）", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });

  it("hashString は 32bit 符号なし整数を返す", () => {
    for (const s of ["", "a", "hero_primary_cta:xyz", "日本語"]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("assignVariant は同一 unitId に対して安定", () => {
    const a = assignVariant("hero_primary_cta", "user-123");
    const b = assignVariant("hero_primary_cta", "user-123");
    expect(a).toBe(b);
    expect(["control", "treatment"]).toContain(a);
  });

  it("多数の unitId でおおむね 50/50 に分かれる（40〜60%）", () => {
    const N = 4000;
    let treatment = 0;
    for (let i = 0; i < N; i++) {
      if (assignVariant("hero_primary_cta", `uid-${i}`) === "treatment") treatment++;
    }
    const ratio = treatment / N;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it("全実験の variants に control/treatment が揃い、文言が空でない", () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      for (const v of ["control", "treatment"] as Variant[]) {
        expect(exp.variants[v], `${exp.key}.${v}`).toBeTruthy();
      }
    }
  });

  it("レジストリの key と登録キーが一致する", () => {
    for (const [key, exp] of Object.entries(EXPERIMENTS)) {
      expect(exp.key).toBe(key);
    }
    expect(Object.keys(EXPERIMENTS)).toEqual(expect.arrayContaining(["hero_primary_cta", "home_final_cta"]));
  });
});
