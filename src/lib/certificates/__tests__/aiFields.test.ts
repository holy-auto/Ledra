import { describe, it, expect } from "vitest";

import { CERT_AI_COLUMNS, certAiFields } from "../aiFields";

describe("CERT_AI_COLUMNS", () => {
  it("実在する列だけを並べる（存在しない列を1つでも入れるとクエリごと 400 になる）", () => {
    expect(CERT_AI_COLUMNS.split(",").map((c) => c.trim())).toEqual([
      "service_type",
      "content_free_text",
      "coating_products_json",
      "expiry_value",
      "content_preset_json",
    ]);
  });
});

describe("certAiFields", () => {
  it("実列を AI 側の項目名に対応づける", () => {
    expect(
      certAiFields({
        service_type: "ガラスコーティング",
        content_free_text: "全面施工",
        coating_products_json: [{ name: "Product A" }, { name: "Product B" }],
        expiry_value: "3年",
      }),
    ).toEqual({
      service_name: "ガラスコーティング",
      description: "全面施工",
      material_info: "Product A, Product B",
      warranty_period: "3年",
    });
  });

  it("行が無くても落ちない。施工名だけは空文字を返す（消費側が string を要求する）", () => {
    expect(certAiFields(null)).toEqual({
      service_name: "",
      description: undefined,
      material_info: undefined,
      warranty_period: undefined,
    });
  });

  it("空文字と空白だけの値は undefined 扱いにする（AI に空の項目を渡さない）", () => {
    const r = certAiFields({ service_type: "  ", content_free_text: "", expiry_value: "1年" });
    expect(r.service_name).toBe("");
    expect(r.description).toBeUndefined();
    expect(r.warranty_period).toBe("1年");
  });

  describe("使用資材の取り出し", () => {
    it("文字列はそのまま", () => {
      expect(certAiFields({ coating_products_json: "手書きの資材メモ" }).material_info).toBe("手書きの資材メモ");
    });

    it("name を持つ配列は名前を並べる", () => {
      expect(certAiFields({ coating_products_json: [{ name: "A" }, { name: "B" }] }).material_info).toBe("A, B");
    });

    it("文字列の配列も名前として扱う", () => {
      expect(certAiFields({ coating_products_json: ["A", "B"] }).material_info).toBe("A, B");
    });

    it("name の無い配列は JSON のまま渡す（欠落させるより情報量が多い）", () => {
      expect(certAiFields({ coating_products_json: [{ sku: "X-1" }] }).material_info).toBe('[{"sku":"X-1"}]');
    });

    it("空配列は undefined（空文字を渡さない）", () => {
      expect(certAiFields({ coating_products_json: [] }).material_info).toBe("[]");
    });

    it("null は undefined", () => {
      expect(certAiFields({ coating_products_json: null }).material_info).toBeUndefined();
    });
  });
});

describe("work_areas（施工箇所）", () => {
  it("content_preset_json.work_areas を読む（専用の列は無い）", () => {
    expect(
      certAiFields({ content_preset_json: { ai_auto_draft: true, work_areas: ["ボンネット", "ルーフ"] } }).work_areas,
    ).toBe("ボンネット、ルーフ");
  });

  it("文字列で入っていてもそのまま返す", () => {
    expect(certAiFields({ content_preset_json: { work_areas: "全面" } }).work_areas).toBe("全面");
  });

  it("無い・空・型違いは undefined（AI 側は「なし」と表示する）", () => {
    expect(certAiFields({}).work_areas).toBeUndefined();
    expect(certAiFields({ content_preset_json: null }).work_areas).toBeUndefined();
    expect(certAiFields({ content_preset_json: {} }).work_areas).toBeUndefined();
    expect(certAiFields({ content_preset_json: { work_areas: [] } }).work_areas).toBeUndefined();
    expect(certAiFields({ content_preset_json: { work_areas: ["", "  "] } }).work_areas).toBeUndefined();
    expect(certAiFields({ content_preset_json: "文字列" }).work_areas).toBeUndefined();
  });

  it("SELECT する列に content_preset_json が入っている（入れ忘れると常に undefined になる）", () => {
    expect(CERT_AI_COLUMNS.split(",").map((c) => c.trim())).toContain("content_preset_json");
  });
});
