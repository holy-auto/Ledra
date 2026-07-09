/**
 * 供給パートナー auto-send のフルパイプライン統合テスト。
 *
 * 低在庫検知 → 調達先選定 → 発注ドラフト起票 → decideAutoSend (壁3 隣接ガード)
 * → placeOrderViaApi の実 HTTP → sent 化 までを、実コードのまま 1 本で通す。
 *
 * モックするのは IO 境界だけ:
 *   - Supabase admin (in-memory store)
 *   - global fetch (パートナー発注 API の応答)
 *   - readSecret (API 鍵の復号)
 *   - AI 自動化ゲート / プラン機能ゲート
 * 選定 (reorderSelection)・金額計算 (computeReorderQuantity)・ガード (decideAutoSend)・
 * 搬送 (placeOrderViaApi + withRetry + ボディ/ヘッダ組立) は実物を実行する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- in-memory Supabase admin mock (hoisted) ----
const { state, makeAdmin } = vi.hoisted(() => {
  const state: { store: Record<string, any[]> } = { store: {} };
  let seq = 0;
  function makeAdmin() {
    const store = state.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: any) => boolean> = [];
      let op: "select" | "insert" | "update" | "delete" = "select";
      let payload: any = null;
      let inserted: any[] = [];
      let limitN: number | null = null;

      function matched() {
        let out = rows.filter((r) => filters.every((f) => f(r)));
        if (limitN != null) out = out.slice(0, limitN);
        return out;
      }
      function settle(single: boolean) {
        if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
        if (op === "update") {
          for (const r of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(r, payload);
          return { data: null, error: null };
        }
        if (op === "delete") {
          state.store[table] = rows.filter((r) => !filters.every((f) => f(r)));
          return { data: null, error: null };
        }
        const out = matched();
        return { data: single ? (out[0] ?? null) : out, error: null };
      }

      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
        in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
        gt: (c: string, v: any) => (filters.push((r) => Number(r[c]) > Number(v)), b),
        gte: (c: string, v: any) => (filters.push((r) => String(r[c] ?? "") >= String(v)), b),
        lt: (c: string, v: any) => (filters.push((r) => Number(r[c]) < Number(v)), b),
        lte: (c: string, v: any) => (filters.push((r) => Number(r[c]) <= Number(v)), b),
        not: (c: string, o: string, v: any) => {
          if (o === "is" && v === null) filters.push((r) => r[c] != null);
          return b;
        },
        order: () => b,
        limit: (n: number) => ((limitN = n), b),
        insert: (p: any) => {
          op = "insert";
          payload = p;
          const arr = Array.isArray(p) ? p : [p];
          inserted = arr.map((x) => {
            const row = { ...x };
            if (table === "purchase_orders" && row.id == null) row.id = `po-${++seq}`;
            rows.push(row);
            return row;
          });
          return b;
        },
        update: (p: any) => ((op = "update"), (payload = p), b),
        delete: () => ((op = "delete"), b),
        single: () => Promise.resolve(settle(true)),
        maybeSingle: () => Promise.resolve(settle(true)),
        then: (res: any, rej: any) => Promise.resolve(settle(false)).then(res, rej),
      };
      return b;
    }
    return { from };
  }
  return { state, makeAdmin };
});

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeAdmin() }));
vi.mock("@/lib/crypto/tenantSecrets", () => ({
  readSecret: vi.fn(async (ct: any) => (ct ? "test-api-key" : null)),
}));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/automation/orchestrator", () => ({ shouldAutoDraftReorder: vi.fn(() => true) }));
vi.mock("@/lib/billing/planFeatures", () => ({
  canUseFeature: () => true,
  normalizePlanTier: (x: any) => x,
}));

import { maybeAutoDraftPartnerReordersForTenant } from "../partnerReorder";
import { __resetBreakersForTest } from "@/lib/http/withRetry";

function seed(): Record<string, any[]> {
  return {
    tenants: [{ id: "t1", plan_tier: "business", is_active: true, name: "テスト施工店" }],
    inventory_items: [
      {
        id: "inv1",
        tenant_id: "t1",
        name: "コーティング剤A",
        supplier_sku: "SKU-A",
        reorder_qty: 20,
        current_stock: 0,
        min_stock: 10,
        is_active: true,
        supply_partner_product_id: "pp1",
      },
    ],
    tenant_supply_links: [
      { tenant_id: "t1", supply_partner_id: "p1", is_enabled: true, priority: 1, price_overrides: null },
    ],
    supply_partners: [
      {
        id: "p1",
        status: "active",
        is_trusted: true,
        api_endpoint: "https://partner.example.com/orders",
        api_auth_type: "api_key",
      },
    ],
    supply_partner_products: [
      {
        id: "pp1",
        supply_partner_id: "p1",
        sku: "SKU-A",
        list_price: 3200,
        lead_time_days: 3,
        stock_status: "in_stock",
        is_active: true,
      },
    ],
    supply_partner_credentials: [{ supply_partner_id: "p1", api_key_ciphertext: "enc-xxx" }],
    tenant_supply_auto_send_settings: [
      { tenant_id: "t1", enabled: true, max_order_jpy: 1_000_000, monthly_cap_jpy: 5_000_000 },
    ],
    purchase_orders: [],
    purchase_order_items: [],
  };
}

let fetchMock: any;

beforeEach(() => {
  state.store = seed();
  __resetBreakersForTest();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ order_id: "EXT-123" }) }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("maybeAutoDraftPartnerReordersForTenant — auto-send E2E (壁3 隣接)", () => {
  it("低在庫→ドラフト起票→全条件成立で API 自動送信し sent 化する", async () => {
    const res = await maybeAutoDraftPartnerReordersForTenant("t1");
    expect(res).toEqual({ created: 1, skipped: 0, autoSent: 1 });

    // PO が draft→sent / transport=api / 外部注文番号まで反映される
    const po = state.store.purchase_orders[0];
    expect(po.status).toBe("sent");
    expect(po.source).toBe("auto");
    expect(po.transport).toBe("api");
    expect(po.transport_status).toBe("acked");
    expect(po.external_order_id).toBe("EXT-123");
    expect(po.sent_at).toBeTruthy();
    expect(po.subtotal).toBe(64000); // 3200 × 20 (= list_price × reorder_qty)

    // 明細が 1 行
    expect(state.store.purchase_order_items).toHaveLength(1);
    expect(state.store.purchase_order_items[0]).toMatchObject({
      sku: "SKU-A",
      quantity: 20,
      unit_cost: 3200,
      amount: 64000,
    });

    // 実 HTTP は 1 回。正しい endpoint / 認証ヘッダ / ボディ (金額は作り直さず確定値)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://partner.example.com/orders");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("test-api-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.po_number).toMatch(/^PO-/);
    expect(body.subtotal).toBe(64000);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ sku: "SKU-A", quantity: 20, unit_cost: 3200 });
  });

  it("運営の信頼承認は不要 (is_trusted=false でも金額上限内なら自動送信する)", async () => {
    // is_trusted ゲートは撤廃。金額上限の範囲内なら承認なしで送信する。
    state.store.supply_partners[0].is_trusted = false;
    const res = await maybeAutoDraftPartnerReordersForTenant("t1");
    expect(res.created).toBe(1);
    expect(res.autoSent).toBe(1);
    expect(state.store.purchase_orders[0].status).toBe("sent");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("auto-send 未 opt-in (enabled=false) は送信せず draft のまま", async () => {
    state.store.tenant_supply_auto_send_settings[0].enabled = false;
    const res = await maybeAutoDraftPartnerReordersForTenant("t1");
    expect(res.created).toBe(1);
    expect(res.autoSent).toBe(0);
    expect(state.store.purchase_orders[0].status).toBe("draft");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("1 発注あたり上限を超える額は送信しない (exceeds_per_order_cap)", async () => {
    state.store.tenant_supply_auto_send_settings[0].max_order_jpy = 1000; // 64000 > 1000
    const res = await maybeAutoDraftPartnerReordersForTenant("t1");
    expect(res.created).toBe(1);
    expect(res.autoSent).toBe(0);
    expect(state.store.purchase_orders[0].status).toBe("draft");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API 連携なし (api_auth_type=none) はメールのみ扱いで自動送信しない", async () => {
    state.store.supply_partners[0].api_auth_type = "none";
    state.store.supply_partners[0].api_endpoint = null;
    const res = await maybeAutoDraftPartnerReordersForTenant("t1");
    expect(res.created).toBe(1);
    expect(res.autoSent).toBe(0);
    expect(state.store.purchase_orders[0].status).toBe("draft");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
