import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock("@/lib/http/withRetry", () => ({ withRetry: (_n: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => ({ messages: { parse: (...a: unknown[]) => parseMock(...a) } }),
  AI_MODEL_FAST: "fast",
}));

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

  describe("with the AI path enabled", () => {
    let originalKey: string | undefined;

    beforeEach(() => {
      originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-key";
      parseMock.mockReset();
    });

    afterEach(() => {
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      else delete process.env.ANTHROPIC_API_KEY;
    });

    const MENU_CANDIDATES = [
      { id: "m1", name: "ホイールコーティング", unit_price: 8000, category_large: "コーティング" },
    ];

    it("uses the candidate's canonical name/price, ignoring the AI's own restated values", async () => {
      // AI が id は本物 (m1) を返しつつ、名前・価格を言い換えて (誤って安く) 返してきたケース。
      parseMock.mockResolvedValue({
        parsed_output: {
          options: [{ menu_item_id: "m1", name: "ホイールコーティング(セール)", price: 5000, reason: "おすすめです" }],
        },
      });
      const result = await generateOptionRecommendations({
        vehicle: VEHICLE,
        serviceCategory: "コーティング",
        menuCandidates: MENU_CANDIDATES,
        pastInvoices: [],
      });
      expect(result.ai).toBe(true);
      // AI の言い換え (5000円・セール表記) ではなく、登録メニューの正規の値がそのまま使われる。
      expect(result.options).toEqual([
        { menuItemId: "m1", name: "ホイールコーティング", price: 8000, reason: "おすすめです" },
      ]);
    });

    it("drops a suggestion whose menu_item_id does not exist in the candidate set (hallucination)", async () => {
      parseMock.mockResolvedValue({
        parsed_output: {
          options: [{ menu_item_id: "does-not-exist", name: "架空オプション", price: 99999, reason: "..." }],
        },
      });
      const input = {
        vehicle: VEHICLE,
        serviceCategory: "コーティング",
        menuCandidates: MENU_CANDIDATES,
        pastInvoices: [],
      };
      const result = await generateOptionRecommendations(input);
      // 存在しない id は捨てられ、deterministic フォールバックに落ちる。
      expect(result).toEqual(buildDeterministicOptions(input));
    });

    it("accepts freeform AI suggestions only when there is no registered menu catalog", async () => {
      parseMock.mockResolvedValue({
        parsed_output: {
          options: [{ menu_item_id: null, name: "ガラスコーティング", price: 21000, reason: "過去のご利用実績から" }],
        },
      });
      const result = await generateOptionRecommendations({
        vehicle: VEHICLE,
        serviceCategory: "コーティング",
        menuCandidates: [],
        pastInvoices: [
          { items: [{ description: "ガラスコーティング", unit_price: 21000, quantity: 1 }], total: 21000 },
        ],
      });
      expect(result.ai).toBe(true);
      expect(result.options).toEqual([
        { menuItemId: null, name: "ガラスコーティング", price: 21000, reason: "過去のご利用実績から" },
      ]);
    });
  });
});
