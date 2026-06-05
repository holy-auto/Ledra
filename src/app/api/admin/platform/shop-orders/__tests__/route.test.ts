/**
 * 運営の全テナント ショップ注文管理 API のテスト。
 * 認証ゲート (isPlatformAdmin) / 一覧取得 / ステータス更新 + 監査ログ / 異常系を検証する。
 * createPlatformScopedAdmin は in-memory store に差し替え (service-role 相当)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const O1 = "11111111-1111-4111-8111-111111111111";
const O2 = "22222222-2222-4222-8222-222222222222";
const MISSING = "99999999-9999-4999-8999-999999999999";

const h = vi.hoisted(() => {
  const h: any = {
    caller: { userId: "u1", tenantId: "pt", role: "super_admin" },
    isPlatform: true,
    store: {} as Record<string, any[]>,
  };
  function makeAdmin() {
    const store = h.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: any) => boolean> = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: any = null;
      let inserted: any[] = [];
      function run(single: boolean) {
        if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
        if (op === "update") {
          for (const r of rows.filter((r: any) => filters.every((f) => f(r)))) Object.assign(r, payload);
          return { data: null, error: null };
        }
        const out = rows.filter((r: any) => filters.every((f) => f(r)));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }
      const b: any = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
        insert: (p: any) => {
          op = "insert";
          payload = p;
          inserted = (Array.isArray(p) ? p : [p]).map((x) => ({ ...x }));
          rows.push(...inserted);
          return b;
        },
        update: (p: any) => ((op = "update"), (payload = p), b),
        single: () => Promise.resolve(run(true)),
        maybeSingle: () => Promise.resolve(run(true)),
        then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
      };
      return b;
    }
    return { from };
  }
  h.makeAdmin = makeAdmin;
  return h;
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: async () => h.caller }));
vi.mock("@/lib/auth/platformAdmin", () => ({ isPlatformAdmin: () => h.isPlatform }));
vi.mock("@/lib/supabase/admin", () => ({ createPlatformScopedAdmin: () => h.makeAdmin() }));

import { GET, PUT } from "../route";

function getReq() {
  return { url: "http://localhost/api/admin/platform/shop-orders" } as any;
}
function putReq(body: any) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  h.caller = { userId: "u1", tenantId: "pt", role: "super_admin" };
  h.isPlatform = true;
  h.store = {
    shop_orders: [
      {
        id: O1,
        tenant_id: "t1",
        order_number: "SO-AAA",
        status: "paid",
        payment_method: "stripe",
        subtotal: 5000,
        tax: 500,
        total: 5500,
        note: null,
        shipped_at: null,
        completed_at: null,
        created_at: "2026-06-04T00:00:00Z",
        tenants: { name: "テナント1", slug: "t1" },
        shop_order_items: [],
      },
      {
        id: O2,
        tenant_id: "t2",
        order_number: "SO-BBB",
        status: "pending",
        payment_method: "invoice",
        subtotal: 1000,
        tax: 100,
        total: 1100,
        note: null,
        shipped_at: null,
        completed_at: null,
        created_at: "2026-06-03T00:00:00Z",
        tenants: { name: "テナント2", slug: "t2" },
        shop_order_items: [],
      },
    ],
    admin_audit_logs: [],
  };
});

describe("GET /api/admin/platform/shop-orders", () => {
  it("運営は全テナントの注文一覧を取得できる", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(2);
    const ids = json.orders.map((o: any) => o.id);
    expect(ids).toContain(O1);
    expect(ids).toContain(O2);
  });

  it("非運営は 403", async () => {
    h.isPlatform = false;
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/admin/platform/shop-orders (ステータス更新)", () => {
  it("運営は発送済みに更新でき shipped_at と監査ログが残る", async () => {
    const res = await PUT(putReq({ order_id: O1, status: "shipped" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("shipped");

    const row = h.store.shop_orders.find((o: any) => o.id === O1);
    expect(row.status).toBe("shipped");
    expect(row.shipped_at).toBeTruthy();

    const log = h.store.admin_audit_logs[0];
    expect(log.action).toBe("platform.shop_order.status_change");
    expect(log.target_type).toBe("shop_order");
    expect(log.target_id).toBe(O1);
    expect(log.after_data.status).toBe("shipped");
  });

  it("完了に更新すると completed_at が入る", async () => {
    const res = await PUT(putReq({ order_id: O2, status: "completed" }));
    expect(res.status).toBe(200);
    const row = h.store.shop_orders.find((o: any) => o.id === O2);
    expect(row.status).toBe("completed");
    expect(row.completed_at).toBeTruthy();
  });

  it("非運営は 403 で変更されない", async () => {
    h.isPlatform = false;
    const res = await PUT(putReq({ order_id: O1, status: "shipped" }));
    expect(res.status).toBe(403);
    expect(h.store.shop_orders.find((o: any) => o.id === O1).status).toBe("paid");
  });

  it("不正なステータスは 400", async () => {
    const res = await PUT(putReq({ order_id: O1, status: "teleported" }));
    expect(res.status).toBe(400);
  });

  it("不正な order_id は 400", async () => {
    const res = await PUT(putReq({ order_id: "not-a-uuid", status: "shipped" }));
    expect(res.status).toBe(400);
  });

  it("存在しない注文は 404", async () => {
    const res = await PUT(putReq({ order_id: MISSING, status: "shipped" }));
    expect(res.status).toBe(404);
  });
});
