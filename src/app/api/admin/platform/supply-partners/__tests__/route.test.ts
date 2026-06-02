/**
 * 運営の供給パートナー信頼トグル API のテスト。
 * 認証ゲート (isPlatformAdmin) / is_trusted 付与・解除 / 監査ログ / 異常系を検証する。
 * createPlatformScopedAdmin は in-memory store に差し替え (service-role 相当)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
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

import { GET, POST } from "../route";

function postReq(body: any) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  h.caller = { userId: "u1", tenantId: "pt", role: "super_admin" };
  h.isPlatform = true;
  h.store = {
    supply_partners: [
      {
        id: P1,
        name: "卸元A",
        contact_email: "a@example.jp",
        status: "active",
        integration_status: "connected",
        is_trusted: false,
        agent_id: "ag1",
        api_endpoint: "https://a.example.com",
        api_auth_type: "api_key",
        last_order_at: null,
        created_at: "2026-06-01",
      },
      {
        id: P2,
        name: "卸元B",
        contact_email: null,
        status: "pending",
        integration_status: "unconfigured",
        is_trusted: false,
        agent_id: "ag2",
        api_endpoint: null,
        api_auth_type: "none",
        last_order_at: null,
        created_at: "2026-05-01",
      },
    ],
    supply_partner_credentials: [{ supply_partner_id: P1, api_key_ciphertext: "enc" }],
    admin_audit_logs: [],
  };
});

describe("GET /api/admin/platform/supply-partners", () => {
  it("運営は一覧を取得でき credentials_configured が計算される", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const byId: Record<string, any> = Object.fromEntries(json.partners.map((p: any) => [p.id, p]));
    expect(byId[P1].credentials_configured).toBe(true);
    expect(byId[P2].credentials_configured).toBe(false);
  });

  it("非運営は 403", async () => {
    h.isPlatform = false;
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/platform/supply-partners (is_trusted トグル)", () => {
  it("運営は信頼を付与でき監査ログが残る", async () => {
    const res = await POST(postReq({ supply_partner_id: P1, is_trusted: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.is_trusted).toBe(true);
    expect(h.store.supply_partners.find((p: any) => p.id === P1).is_trusted).toBe(true);
    const log = h.store.admin_audit_logs[0];
    expect(log.action).toBe("platform.supply_partner.trust");
    expect(log.target_type).toBe("supply_partner");
    expect(log.target_id).toBe(P1);
  });

  it("信頼解除もできる (untrust)", async () => {
    h.store.supply_partners[0].is_trusted = true;
    const res = await POST(postReq({ supply_partner_id: P1, is_trusted: false }));
    expect(res.status).toBe(200);
    expect(h.store.supply_partners[0].is_trusted).toBe(false);
    expect(h.store.admin_audit_logs[0].action).toBe("platform.supply_partner.untrust");
  });

  it("非運営は 403 で変更されない", async () => {
    h.isPlatform = false;
    const res = await POST(postReq({ supply_partner_id: P1, is_trusted: true }));
    expect(res.status).toBe(403);
    expect(h.store.supply_partners[0].is_trusted).toBe(false);
  });

  it("不正な body は 400", async () => {
    const res = await POST(postReq({ supply_partner_id: "not-a-uuid", is_trusted: true }));
    expect(res.status).toBe(400);
  });

  it("存在しないパートナーは 404", async () => {
    const res = await POST(postReq({ supply_partner_id: MISSING, is_trusted: true }));
    expect(res.status).toBe(404);
  });
});
