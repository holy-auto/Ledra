/**
 * 供給パートナー受注確定 Webhook ルートの統合テスト。
 *
 * 実コードのまま通す: 署名検証 (verifySupplyWebhookSignature) → ペイロード検証 →
 * 該当発注の特定 → transport_status / external_order_id 更新。
 * モックは IO 境界のみ (service-role admin = in-memory store / readSecret)。
 * 署名は実 computeSupplyWebhookSignature で生成する (本物の HMAC を検証)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SECRET = "whsec_" + "ab".repeat(24); // whsec_ + 48 hex

const h = vi.hoisted(() => {
  const h: any = { store: {} as Record<string, any[]> };
  function makeAdmin() {
    const store = h.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: any) => boolean> = [];
      let op: "select" | "update" = "select";
      let payload: any = null;
      function run(single: boolean) {
        if (op === "update") {
          for (const r of rows.filter((r: any) => filters.every((f) => f(r)))) Object.assign(r, payload);
          return { data: null, error: null };
        }
        const out = rows.filter((r: any) => filters.every((f) => f(r)));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r: any) => r[c] === v), b),
        order: () => b,
        limit: () => b,
        update: (p: any) => ((op = "update"), (payload = p), b),
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

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => h.makeAdmin() }));
vi.mock("@/lib/crypto/tenantSecrets", () => ({ readSecret: async (ct: any) => (ct ? SECRET : null) }));

import { POST } from "../route";
import { computeSupplyWebhookSignature } from "@/lib/supply/webhookSignature";

const PARTNER = "11111111-1111-4111-8111-111111111111";

function makeReq(rawBody: string, sig: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== null) headers["x-ledra-signature"] = sig;
  return new Request(`http://localhost/api/webhooks/supply/${PARTNER}`, {
    method: "POST",
    body: rawBody,
    headers,
  }) as any;
}
function paramsOf(partnerId: string) {
  return { params: Promise.resolve({ partnerId }) };
}
function signedBody(obj: Record<string, unknown>) {
  const raw = JSON.stringify(obj);
  return { raw, sig: computeSupplyWebhookSignature(raw, SECRET) };
}

beforeEach(() => {
  h.store = {
    supply_partner_credentials: [{ supply_partner_id: PARTNER, webhook_secret_ciphertext: "enc" }],
    purchase_orders: [
      {
        id: "po1",
        tenant_id: "t1",
        supply_partner_id: PARTNER,
        po_number: "PO-1",
        transport_status: "pending",
        external_order_id: null,
      },
    ],
  };
});

describe("POST /api/webhooks/supply/[partnerId]", () => {
  it("正しい署名 + accepted で transport_status=acked, external_order_id を更新する", async () => {
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "accepted", external_order_id: "ORD-9" });
    const res = await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const po = h.store.purchase_orders[0];
    expect(po.transport_status).toBe("acked");
    expect(po.external_order_id).toBe("ORD-9");
  });

  it("rejected は transport_status=failed", async () => {
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "rejected" });
    const res = await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(res.status).toBe(200);
    expect(h.store.purchase_orders[0].transport_status).toBe("failed");
  });

  it("PO の status (received 等) は変更しない (壁3)", async () => {
    h.store.purchase_orders[0].status = "sent";
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "shipped" });
    await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(h.store.purchase_orders[0].status).toBe("sent"); // 不変
    expect(h.store.purchase_orders[0].transport_status).toBe("acked");
  });

  it("署名不一致は 401 で発注を更新しない", async () => {
    const { raw } = signedBody({ po_number: "PO-1", status: "accepted" });
    const res = await POST(makeReq(raw, "sha256=deadbeef"), paramsOf(PARTNER));
    expect(res.status).toBe(401);
    expect(h.store.purchase_orders[0].transport_status).toBe("pending");
  });

  it("署名ヘッダ欠落は 401", async () => {
    const { raw } = signedBody({ po_number: "PO-1", status: "accepted" });
    const res = await POST(makeReq(raw, null), paramsOf(PARTNER));
    expect(res.status).toBe(401);
  });

  it("Webhook シークレット未設定は 404 not_configured", async () => {
    h.store.supply_partner_credentials = [];
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "accepted" });
    const res = await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_configured");
  });

  it("該当発注が無いと 404 order_not_found", async () => {
    const { raw, sig } = signedBody({ po_number: "PO-UNKNOWN", status: "accepted" });
    const res = await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("order_not_found");
  });

  it("不正なステータスは 400 invalid_payload (署名は通過)", async () => {
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "bogus" });
    const res = await POST(makeReq(raw, sig), paramsOf(PARTNER));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_payload");
  });

  it("partnerId の形式不正は 404 not_found", async () => {
    const { raw, sig } = signedBody({ po_number: "PO-1", status: "accepted" });
    const res = await POST(makeReq(raw, sig), paramsOf("not-a-uuid"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
