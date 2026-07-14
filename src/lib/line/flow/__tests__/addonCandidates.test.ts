import { describe, it, expect, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "../../../ai/automation/__tests__/fakeSupabaseAdmin";
import { fetchAddonRecommendations } from "../addonCandidates";

const TENANT = "11111111-1111-1111-1111-111111111111";
let store: FakeStore;

beforeEach(() => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // deterministic フォールバックのみを検証する
  store = emptyStore({ menu_items: [], invoices: [] });
  return () => {
    if (original) process.env.ANTHROPIC_API_KEY = original;
  };
});

describe("fetchAddonRecommendations", () => {
  it("recommends from the tenant's active menu catalog, excluding items already in the base quote", async () => {
    store.tables.menu_items = [
      {
        tenant_id: TENANT,
        id: "m1",
        name: "コーティング",
        unit_price: 50000,
        category_large: "コーティング",
        is_active: true,
        sort_order: 0,
      },
      {
        tenant_id: TENANT,
        id: "m2",
        name: "ホイールコーティング",
        unit_price: 8000,
        category_large: "コーティング",
        is_active: true,
        sort_order: 1,
      },
      {
        tenant_id: TENANT,
        id: "m3",
        name: "室内クリーニング",
        unit_price: 12000,
        category_large: "クリーニング",
        is_active: true,
        sort_order: 2,
      },
    ];
    const admin = makeFakeAdmin(store);

    const result = await fetchAddonRecommendations(admin, TENANT, {
      vehicle: { model: "アルファード" },
      serviceCategory: "コーティング",
      baseItemNames: ["コーティング"],
    });

    // ベース見積りと同名の "コーティング" は除外される。
    expect(result.options.some((o) => o.name === "コーティング")).toBe(false);
    // カテゴリが一致するホイールコーティングが候補に残る。
    expect(result.options.some((o) => o.name === "ホイールコーティング")).toBe(true);
  });

  it("returns no options when the tenant has neither a menu catalog nor invoice history", async () => {
    const admin = makeFakeAdmin(store);
    const result = await fetchAddonRecommendations(admin, TENANT, {
      vehicle: { model: "アルファード" },
      serviceCategory: "コーティング",
      baseItemNames: [],
    });
    expect(result.options).toHaveLength(0);
    expect(result.ai).toBe(false);
  });
});
