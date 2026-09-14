/**
 * 組織メンバー (所属テナント) 管理 API のテスト。
 *
 * A-C1 是正の回帰確認: POST は「追加対象テナントの owner」である caller のみ
 * 許可する。組織オーナーというだけで任意テナントを追加できてはならない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OWN_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT_ID = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => {
  const ORG_ID = "11111111-1111-4111-8111-111111111111";
  const OWN_TENANT_ID = "22222222-2222-4222-8222-222222222222";
  const OTHER_TENANT_ID = "33333333-3333-4333-8333-333333333333";
  const h: any = {
    caller: { userId: "u1", tenantId: OWN_TENANT_ID, role: "owner" },
    orgs: [{ id: ORG_ID, owner_id: "u1" }] as any[],
    memberships: [{ tenant_id: OWN_TENANT_ID, user_id: "u1", role: "owner" }] as any[],
    tenants: [
      { id: OWN_TENANT_ID, name: "自店舗", plan_tier: "standard" },
      { id: OTHER_TENANT_ID, name: "他店舗", plan_tier: "standard" },
    ] as any[],
    orgMembers: [] as any[],
  };

  function makeQueryable(rows: any[], opts: { insertable?: boolean } = {}) {
    const filters: Array<(r: any) => boolean> = [];
    let op: "select" | "insert" = "select";
    let inserted: any[] = [];
    function run(single: boolean) {
      if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
      const out = rows.filter((r) => filters.every((f) => f(r)));
      return { data: single ? (out[0] ?? null) : out, error: null };
    }
    const b: any = {
      select: () => b,
      order: () => b,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
      insert: (p: any) => {
        if (!opts.insertable) throw new Error(`insert not allowed on this table`);
        op = "insert";
        inserted = (Array.isArray(p) ? p : [p]).map((x) => ({ ...x, id: "new-id", joined_at: "2026-09-08T00:00:00Z" }));
        rows.push(...inserted);
        return b;
      },
      single: () => Promise.resolve(run(true)),
      maybeSingle: () => Promise.resolve(run(true)),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return b;
  }

  h.makeServerClient = () => ({
    from: (table: string) => {
      if (table === "organizations") return makeQueryable(h.orgs);
      if (table === "tenant_memberships") return makeQueryable(h.memberships);
      throw new Error(`unexpected server table: ${table}`);
    },
  });

  h.makeAdmin = () => ({
    from: (table: string) => {
      if (table === "tenants") return makeQueryable(h.tenants);
      if (table === "organization_members") return makeQueryable(h.orgMembers, { insertable: true });
      throw new Error(`unexpected admin table: ${table}`);
    },
  });

  return h;
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.makeServerClient() }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: async () => h.caller,
  requireMinRole: (caller: any, role: string) => {
    const order = ["viewer", "staff", "admin", "owner"];
    return order.indexOf(caller.role) >= order.indexOf(role);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createPlatformScopedAdmin: () => h.makeAdmin() }));

import { POST } from "../route";

function postReq(body: any) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  h.caller = { userId: "u1", tenantId: OWN_TENANT_ID, role: "owner" };
  h.orgs = [{ id: ORG_ID, owner_id: "u1" }];
  h.memberships = [{ tenant_id: OWN_TENANT_ID, user_id: "u1", role: "owner" }];
  h.tenants = [
    { id: OWN_TENANT_ID, name: "自店舗", plan_tier: "standard" },
    { id: OTHER_TENANT_ID, name: "他店舗", plan_tier: "standard" },
  ];
  h.orgMembers = [];
});

describe("POST /api/admin/organizations/[id]/members", () => {
  it("非所属 (owner でない) テナントの追加は 403 になる (A-C1 回帰確認)", async () => {
    const res: any = await POST(postReq({ tenant_id: OTHER_TENANT_ID }), { params: Promise.resolve({ id: ORG_ID }) });
    expect(res.status).toBe(403);
    expect(h.orgMembers.length).toBe(0);
  });

  it("自分が owner のテナントは追加できる", async () => {
    const res: any = await POST(postReq({ tenant_id: OWN_TENANT_ID }), { params: Promise.resolve({ id: ORG_ID }) });
    expect(res.status).toBe(201);
    expect(h.orgMembers.length).toBe(1);
    expect(h.orgMembers[0].tenant_id).toBe(OWN_TENANT_ID);
  });
});
