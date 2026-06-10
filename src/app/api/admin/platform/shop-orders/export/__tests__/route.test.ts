/**
 * 運営の ショップ注文 CSV エクスポート API のテスト。
 * 認証ゲート (isPlatformAdmin) / CSV 整形（BOM・ラベル変換・エスケープ）/ 異常系を検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const h: any = {
    caller: { userId: "u1", tenantId: "pt", role: "super_admin" } as any,
    isPlatform: true,
    store: {} as Record<string, any[]>,
  };
  function makeAdmin() {
    const store = h.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: any) => boolean> = [];
      const b: any = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        then: (res: any, rej: any) =>
          Promise.resolve({ data: rows.filter((r: any) => filters.every((f) => f(r))), error: null }).then(res, rej),
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

import { GET } from "../route";

function req(url = "http://localhost/api/admin/platform/shop-orders/export") {
  return { url } as any;
}

beforeEach(() => {
  h.caller = { userId: "u1", tenantId: "pt", role: "super_admin" };
  h.isPlatform = true;
  h.store = {
    shop_orders: [
      {
        id: "o1",
        tenant_id: "t1",
        order_number: "SO-AAA",
        status: "paid",
        payment_method: "invoice",
        subtotal: 5000,
        tax: 500,
        total: 5500,
        note: "メモ,カンマ入り",
        created_at: "2026-06-04T01:00:00Z",
        shipped_at: null,
        completed_at: null,
        tenants: { name: "テナント1", slug: "t1" },
        shop_order_items: [{ quantity: 2 }, { quantity: 3 }],
      },
    ],
  };
});

describe("GET /api/admin/platform/shop-orders/export", () => {
  it("運営は注文一覧の CSV を取得できる（BOM・ラベル変換・エスケープ）", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(".csv");

    // Excel 用 BOM が先頭に付く（.text() はデコード時に BOM を除去するため raw バイトで確認）。
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("注文番号");
    expect(text).toContain("SO-AAA");
    expect(text).toContain("テナント1");
    // ステータス・支払方法は日本語ラベルへ変換される
    expect(text).toContain("支払済み");
    expect(text).toContain("請求書払い");
    expect(text).toContain("5500");
    // カンマを含む備考はダブルクオートで囲われる
    expect(text).toContain('"メモ,カンマ入り"');
  });

  it("非運営は 403", async () => {
    h.isPlatform = false;
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("未認証は 401", async () => {
    h.caller = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});
