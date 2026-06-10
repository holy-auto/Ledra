/**
 * 運営の ショップ注文 帳票出力 API のテスト。
 * 認証ゲート (isPlatformAdmin) / 種別バリデーション / 注文取得 / レスポンスヘッダ / 異常系を検証する。
 * PDF レンダリングはコストが高いため renderShopOrderDocument はモックする。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const O1 = "11111111-1111-4111-8111-111111111111";
const MISSING = "99999999-9999-4999-8999-999999999999";

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
      function run(single: boolean) {
        const out = rows.filter((r: any) => filters.every((f) => f(r)));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        maybeSingle: () => Promise.resolve(run(true)),
        single: () => Promise.resolve(run(true)),
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
vi.mock("@/lib/shop/shopOrderDocument", () => ({
  renderShopOrderDocument: vi.fn(async () => Buffer.from("%PDF-1.4 test")),
  isShopDocumentKind: (v: unknown) => v === "invoice" || v === "delivery" || v === "receipt",
  SHOP_DOCUMENT_LABELS: { invoice: "請求書", delivery: "納品書", receipt: "領収書" },
}));

import { GET } from "../route";
import { renderShopOrderDocument } from "@/lib/shop/shopOrderDocument";

function req(type = "invoice", id = O1) {
  return { url: `http://localhost/api/admin/platform/shop-orders/${id}/document?type=${type}` } as any;
}
function ctx(id = O1) {
  return { params: Promise.resolve({ id }) };
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
        payment_method: "invoice",
        subtotal: 5000,
        tax: 500,
        total: 5500,
        note: null,
        created_at: "2026-06-04T00:00:00Z",
        shipped_at: null,
        completed_at: null,
        tenants: { name: "テナント1" },
        shop_order_items: [{ product_name: "NFCタグ", quantity: 2, unit_price: 2500, tax_rate: 0.1, amount: 5000 }],
      },
    ],
    tenants: [],
  };
  (renderShopOrderDocument as any).mockClear();
});

describe("GET /api/admin/platform/shop-orders/[id]/document", () => {
  it("運営は請求書 PDF を出力でき、宛先=注文テナントが渡る", async () => {
    const res = await GET(req("invoice"), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("invoice_SO-AAA.pdf");
    expect(renderShopOrderDocument).toHaveBeenCalledTimes(1);
    const arg = (renderShopOrderDocument as any).mock.calls[0][0];
    expect(arg.kind).toBe("invoice");
    expect(arg.recipientName).toBe("テナント1");
    expect(arg.order.order_number).toBe("SO-AAA");
    expect(arg.items).toHaveLength(1);
  });

  it("領収書も種別に応じて生成される", async () => {
    const res = await GET(req("receipt"), ctx());
    expect(res.status).toBe(200);
    const arg = (renderShopOrderDocument as any).mock.calls[0][0];
    expect(arg.kind).toBe("receipt");
  });

  it("不正な type は 400 でレンダリングしない", async () => {
    const res = await GET(req("bogus"), ctx());
    expect(res.status).toBe(400);
    expect(renderShopOrderDocument).not.toHaveBeenCalled();
  });

  it("存在しない注文は 404", async () => {
    const res = await GET(req("invoice", MISSING), ctx(MISSING));
    expect(res.status).toBe(404);
    expect(renderShopOrderDocument).not.toHaveBeenCalled();
  });

  it("非運営は 403", async () => {
    h.isPlatform = false;
    const res = await GET(req("invoice"), ctx());
    expect(res.status).toBe(403);
  });

  it("未認証は 401", async () => {
    h.caller = null;
    const res = await GET(req("invoice"), ctx());
    expect(res.status).toBe(401);
  });
});
