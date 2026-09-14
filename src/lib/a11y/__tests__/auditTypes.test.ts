import { describe, it, expect } from "vitest";
import { WCAG_AA_KEY_CRITERIA, COMPONENT_ARIA_MAP } from "../auditTypes";

describe("WCAG_AA_KEY_CRITERIA", () => {
  it("10 基準以上を収録している", () => {
    expect(WCAG_AA_KEY_CRITERIA.length).toBeGreaterThanOrEqual(10);
  });

  it("全基準に id, level, category, title がある", () => {
    for (const c of WCAG_AA_KEY_CRITERIA) {
      expect(c.id).toBeTruthy();
      expect(["A", "AA", "AAA"]).toContain(c.level);
      expect(["perceivable", "operable", "understandable", "robust"]).toContain(c.category);
      expect(c.title).toBeTruthy();
    }
  });

  it("WCAG 基準 ID が重複しない", () => {
    const ids = WCAG_AA_KEY_CRITERIA.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("4 カテゴリすべてを含む", () => {
    const categories = new Set(WCAG_AA_KEY_CRITERIA.map((c) => c.category));
    expect(categories).toContain("perceivable");
    expect(categories).toContain("operable");
    expect(categories).toContain("understandable");
    expect(categories).toContain("robust");
  });

  it("コントラスト基準 1.4.3 を含む", () => {
    const contrast = WCAG_AA_KEY_CRITERIA.find((c) => c.id === "1.4.3");
    expect(contrast).toBeDefined();
    expect(contrast!.level).toBe("AA");
    expect(contrast!.title).toBe("Contrast (Minimum)");
  });
});

describe("COMPONENT_ARIA_MAP", () => {
  it("5 コンポーネント以上を収録している", () => {
    expect(COMPONENT_ARIA_MAP.length).toBeGreaterThanOrEqual(5);
  });

  it("全エントリに component, required, recommended がある", () => {
    for (const c of COMPONENT_ARIA_MAP) {
      expect(c.component).toBeTruthy();
      expect(Array.isArray(c.required)).toBe(true);
      expect(Array.isArray(c.recommended)).toBe(true);
    }
  });

  it("コンポーネント名が重複しない", () => {
    const names = COMPONENT_ARIA_MAP.map((c) => c.component);
    expect(new Set(names).size).toBe(names.length);
  });

  it("Modal は aria-modal と role=dialog を必須とする", () => {
    const modal = COMPONENT_ARIA_MAP.find((c) => c.component === "Modal");
    expect(modal).toBeDefined();
    expect(modal!.required).toContain("aria-modal");
    expect(modal!.required).toContain("role=dialog");
    expect(modal!.required).toContain("aria-labelledby");
  });

  it("ProgressCard は progressbar ロールを必須とする", () => {
    const pc = COMPONENT_ARIA_MAP.find((c) => c.component === "ProgressCard");
    expect(pc).toBeDefined();
    expect(pc!.required).toContain("role=progressbar");
    expect(pc!.required).toContain("aria-valuenow");
  });
});
