import { describe, it, expect } from "vitest";
import { generateLinkCode, normalizeLinkCode } from "@/lib/line/linkCode";

describe("generateLinkCode", () => {
  it("6文字・紛らわしい文字(0/O/1/I)を含まない", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLinkCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("毎回ランダム（衝突しにくい）", () => {
    const set = new Set(Array.from({ length: 100 }, () => generateLinkCode()));
    expect(set.size).toBeGreaterThan(90);
  });
});

describe("normalizeLinkCode", () => {
  it("大文字化し英数字以外を除去", () => {
    expect(normalizeLinkCode(" ab-cd 23 ")).toBe("ABCD23");
  });
  it("全除去されると空", () => {
    expect(normalizeLinkCode("ーーー")).toBe("");
  });
});
