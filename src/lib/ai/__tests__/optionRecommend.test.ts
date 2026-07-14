import { describe, it, expect } from "vitest";
import { buildDeterministicOptions, generateOptionRecommendations } from "../optionRecommend";

const VEHICLE = { maker: "トヨタ", model: "アルファード", size_class: "LL" };

describe("buildDeterministicOptions", () => {
  it("prefers registered menu items, ranked by past-invoice frequency", () => {
    const result = buildDeterministicOptions({
      vehicle: VEHICLE,
      serviceCategory: "コーティング",
      menuCandidates: [
        { id: "m1", name: "ヘッドライトコーティング", unit_price: 15000, category_large: "コーティング" },
        { id: "m2", name: "ホイールコーティング", unit_price: 8000, category_large: "コーティング" },
        { id: "m3", name: "室内クリーニング", unit_price: 12000, category_large: "クリーニング" },
      ],
      pastInvoices: [
        { items: [{ description: "ホイールコーティング", unit_price: 8000, quantity: 1 }], total: 8000 },
        { items: [{ description: "ホイールコーティング", unit_price: 8000, quantity: 1 }], total: 8000 },
      ],
    });
    expect(result.ai).toBe(false);
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options.length).toBeLessThanOrEqual(3);
    // 過去実績のあるホイールコーティングが最上位に来る。
    expect(result.options[0].name).toBe("ホイールコーティング");
    expect(result.options[0].menuItemId).toBe("m2");
    for (const o of result.options) {
      expect(o.menuItemId).not.toBeNull();
    }
  });

  it("caps at 3 options even with more candidates", () => {
    const result = buildDeterministicOptions({
      vehicle: VEHICLE,
      serviceCategory: "コーティング",
      menuCandidates: Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        name: `オプション${i}`,
        unit_price: 1000 * (i + 1),
        category_large: null,
      })),
      pastInvoices: [],
    });
    expect(result.options).toHaveLength(3);
  });

  it("falls back to past-invoice frequency (freeform, no menu_item_id) when no menu items exist", () => {
    const result = buildDeterministicOptions({
      vehicle: VEHICLE,
      serviceCategory: "コーティング",
      menuCandidates: [],
      pastInvoices: [
        { items: [{ description: "ガラスコーティング", unit_price: 20000, quantity: 1 }], total: 20000 },
        { items: [{ description: "ガラスコーティング", unit_price: 22000, quantity: 1 }], total: 22000 },
      ],
    });
    expect(result.ai).toBe(false);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({ menuItemId: null, name: "ガラスコーティング", price: 21000 });
  });

  it("returns no options when there is neither a menu catalog nor past-invoice history", () => {
    const result = buildDeterministicOptions({
      vehicle: VEHICLE,
      serviceCategory: "コーティング",
      menuCandidates: [],
      pastInvoices: [],
    });
    expect(result.options).toHaveLength(0);
  });
});

describe("generateOptionRecommendations", () => {
  it("returns the deterministic baseline when no AI API key is configured", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const input = {
        vehicle: VEHICLE,
        serviceCategory: "コーティング",
        menuCandidates: [{ id: "m1", name: "ホイールコーティング", unit_price: 8000, category_large: "コーティング" }],
        pastInvoices: [],
      };
      const result = await generateOptionRecommendations(input);
      expect(result).toEqual(buildDeterministicOptions(input));
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
