import { describe, it, expect } from "vitest";
import { menuItemCreateSchema, menuItemDeleteSchema } from "../menu-item";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("menuItemDeleteSchema — 単一/複数一括無効化の受理", () => {
  it("単一 id を受理する（従来互換）", () => {
    const r = menuItemDeleteSchema.safeParse({ id: UUID_A });
    expect(r.success).toBe(true);
  });

  it("ids 配列を受理する（一括無効化）", () => {
    const r = menuItemDeleteSchema.safeParse({ ids: [UUID_A, UUID_B] });
    expect(r.success).toBe(true);
  });

  it("id も ids も無ければ拒否する", () => {
    expect(menuItemDeleteSchema.safeParse({}).success).toBe(false);
  });

  it("空の ids 配列は拒否する", () => {
    expect(menuItemDeleteSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("ids に不正な UUID が混じれば拒否する", () => {
    expect(menuItemDeleteSchema.safeParse({ ids: [UUID_A, "not-a-uuid"] }).success).toBe(false);
  });
});

describe("menuItemCreateSchema — 大/中/小カテゴリの正規化", () => {
  it("カテゴリ未指定なら null になる", () => {
    const r = menuItemCreateSchema.safeParse({ name: "コーティング" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category_large).toBeNull();
      expect(r.data.category_medium).toBeNull();
      expect(r.data.category_small).toBeNull();
    }
  });

  it("空白のみ・空文字は null に、値は trim される", () => {
    const r = menuItemCreateSchema.safeParse({
      name: "コーティング",
      category_large: "  施工  ",
      category_medium: "   ",
      category_small: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category_large).toBe("施工");
      expect(r.data.category_medium).toBeNull();
      expect(r.data.category_small).toBeNull();
    }
  });
});
