/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * pricingIntelligence.buildPricingContext のユニットテスト。
 *
 * Supabase admin クライアントをチェーン可能なフェイクに差し替え、
 * `from(table)` ごとに用意したレスポンスを順に返す。各クエリビルダは
 * thenable なので `await admin.from(...).select()...limit()` がそのまま解決される。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// from(table) ごとのキュー: 各呼び出しで shift して使う
const responses: Record<string, Array<{ data: any; error: any }>> = {
  documents: [],
  vehicles: [],
};

function makeBuilder(table: string) {
  // 末端で await されると responses[table] の先頭を返す thenable。
  const result = responses[table]?.shift() ?? { data: [], error: null };
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (v: any) => any, reject?: (e: any) => any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: (tenantId: string) => ({
    tenantId,
    admin: { from: (table: string) => makeBuilder(table) },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildPricingContext, clearPricingContextCache } from "../pricingIntelligence";

const TENANT = "11111111-1111-1111-1111-111111111111";

/** documents クエリの呼び出し順は: ①accepted ②estimate ③vehicles。 */
function queueDocs(accepted: any[], estimates: any[], vehicles: any[]) {
  responses.documents = [
    { data: accepted, error: null },
    { data: estimates, error: null },
  ];
  responses.vehicles = [{ data: vehicles, error: null }];
}

function line(description: string, unit_price: number, quantity = 1) {
  return { description, unit_price, quantity };
}

beforeEach(() => {
  clearPricingContextCache();
  responses.documents = [];
  responses.vehicles = [];
  vi.clearAllMocks();
});

describe("buildPricingContext", () => {
  it("returns empty context when there are no accepted documents", async () => {
    queueDocs([], [], []);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });
    expect(ctx.tenant_id).toBe(TENANT);
    expect(ctx.patterns).toHaveLength(0);
    expect(ctx.total_invoices_analyzed).toBe(0);
    expect(typeof ctx.computed_at).toBe("string");
  });

  it("returns empty context (no patterns) when the accepted-docs query errors", async () => {
    responses.documents = [{ data: null, error: { message: "boom" } }];
    const ctx = await buildPricingContext(TENANT, 365, { force: true });
    expect(ctx.patterns).toHaveLength(0);
    expect(ctx.total_invoices_analyzed).toBe(0);
  });

  it("builds a single pattern with correct median/p25/p75", async () => {
    const accepted = [
      {
        id: "d1",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-01-01T00:00:00Z",
        items_json: [line("ガラスコーティング", 10000)],
      },
      {
        id: "d2",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c2",
        vehicle_id: null,
        issued_at: "2026-02-01T00:00:00Z",
        items_json: [line("ガラスコーティング", 20000)],
      },
      {
        id: "d3",
        doc_type: "invoice",
        status: "accepted",
        customer_id: "c3",
        vehicle_id: null,
        issued_at: "2026-03-01T00:00:00Z",
        items_json: [line("ガラスコーティング", 30000)],
      },
    ];
    queueDocs(accepted, [], []);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });

    expect(ctx.total_invoices_analyzed).toBe(3);
    // メーカー横断フォールバックのみ → 1 パターン
    expect(ctx.patterns).toHaveLength(1);
    const p = ctx.patterns[0];
    expect(p.service_name).toBe("ガラスコーティング");
    expect(p.maker).toBeUndefined();
    expect(p.sample_count).toBe(3);
    // [10000, 20000, 30000] → median 20000, p25 15000, p75 25000 (線形補間)
    expect(p.median_price).toBe(20000);
    expect(p.p25_price).toBe(15000);
    expect(p.p75_price).toBe(25000);
  });

  it("emits both maker-specific and maker-agnostic patterns", async () => {
    const accepted = [
      {
        id: "d1",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c1",
        vehicle_id: "v1",
        issued_at: "2026-01-01T00:00:00Z",
        items_json: [line("PPF施工", 100000)],
      },
      {
        id: "d2",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c2",
        vehicle_id: "v2",
        issued_at: "2026-02-01T00:00:00Z",
        items_json: [line("PPF施工", 120000)],
      },
    ];
    const vehicles = [
      { id: "v1", maker: "トヨタ" },
      { id: "v2", maker: "ホンダ" },
    ];
    queueDocs(accepted, [], vehicles);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });

    // フォールバック(2) + トヨタ(1) + ホンダ(1) = 3 パターン
    expect(ctx.patterns).toHaveLength(3);
    const fallback = ctx.patterns.find((p) => p.maker === undefined);
    expect(fallback?.sample_count).toBe(2);
    const toyota = ctx.patterns.find((p) => p.maker === "トヨタ");
    expect(toyota?.sample_count).toBe(1);
    expect(toyota?.median_price).toBe(100000);
    const honda = ctx.patterns.find((p) => p.maker === "ホンダ");
    expect(honda?.median_price).toBe(120000);
  });

  it("computes acceptance_rate from estimate→invoice correlation", async () => {
    const accepted = [
      {
        id: "inv1",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-03-10T00:00:00Z",
        items_json: [line("コーティング", 50000)],
      },
    ];
    const estimates = [
      {
        // c1: 見積もり後 90 日以内に請求書あり → converted
        id: "est1",
        doc_type: "estimate",
        status: "accepted",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-03-01T00:00:00Z",
        items_json: [line("コーティング", 55000)],
      },
      {
        // c2: 対応する請求書なし → not converted
        id: "est2",
        doc_type: "estimate",
        status: "sent",
        customer_id: "c2",
        vehicle_id: null,
        issued_at: "2026-03-01T00:00:00Z",
        items_json: [line("コーティング", 60000)],
      },
    ];
    queueDocs(accepted, estimates, []);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });

    const pattern = ctx.patterns.find((p) => p.service_name === "コーティング");
    expect(pattern).toBeDefined();
    // 2 件中 1 件成約 → 0.5
    expect(pattern?.acceptance_rate).toBeCloseTo(0.5, 5);
  });

  it("ignores non-line items (subtotal/heading) and zero/negative prices", async () => {
    const accepted = [
      {
        id: "d1",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-01-01T00:00:00Z",
        items_json: [
          { description: "値引き", unit_price: 0, quantity: 1, type: "line" },
          { name: "小計", unit_price: 99999, quantity: 1, type: "subtotal" },
          line("洗車", 3000),
        ],
      },
    ];
    queueDocs(accepted, [], []);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });
    expect(ctx.patterns).toHaveLength(1);
    expect(ctx.patterns[0].service_name).toBe("洗車");
    expect(ctx.patterns[0].median_price).toBe(3000);
  });

  it("supports items that use `name` instead of `description`", async () => {
    const accepted = [
      {
        id: "d1",
        doc_type: "receipt",
        status: "paid",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-01-01T00:00:00Z",
        items_json: [{ name: "ホイールコーティング", unit_price: 8000, quantity: 1 }],
      },
    ];
    queueDocs(accepted, [], []);
    const ctx = await buildPricingContext(TENANT, 365, { force: true });
    expect(ctx.patterns).toHaveLength(1);
    expect(ctx.patterns[0].service_name).toBe("ホイールコーティング");
  });

  it("serves a cached context on the second call (no force)", async () => {
    const accepted = [
      {
        id: "d1",
        doc_type: "invoice",
        status: "paid",
        customer_id: "c1",
        vehicle_id: null,
        issued_at: "2026-01-01T00:00:00Z",
        items_json: [line("コーティング", 10000)],
      },
    ];
    queueDocs(accepted, [], []);
    const first = await buildPricingContext(TENANT, 365, { force: true });
    expect(first.patterns).toHaveLength(1);

    // 2 回目はキャッシュヒットなので DB レスポンスを用意しなくても同じ結果
    responses.documents = [];
    responses.vehicles = [];
    const second = await buildPricingContext(TENANT);
    expect(second).toEqual(first);
    expect(second.computed_at).toBe(first.computed_at);
  });
});
