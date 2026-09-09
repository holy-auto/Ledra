/**
 * /api/admin/members DELETE のテスト。
 *
 * A-H2 是正の回帰確認: PUT はオーナーのロール変更を拒否しているのに DELETE は
 * 対象ロールを見ずに削除しており、admin がオーナーを排除できた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const CALLER_TENANT = "tenant-1";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const OWNER_ID = "11111111-1111-4111-8111-111111111111";
  const STAFF_ID = "22222222-2222-4222-8222-222222222222";
  const h: any = {
    caller: { userId: "33333333-3333-4333-8333-333333333333", tenantId: "tenant-1", role: "admin" },
    memberships: [
      { user_id: OWNER_ID, tenant_id: "tenant-1", role: "owner" },
      { user_id: STAFF_ID, tenant_id: "tenant-1", role: "staff" },
    ] as any[],
  };

  h.makeAdmin = () => ({
    from: (table: string) => {
      if (table !== "tenant_memberships") throw new Error(`unexpected table: ${table}`);
      const filters: Array<(r: any) => boolean> = [];
      let op: "select" | "delete" = "select";
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        delete: () => ((op = "delete"), b),
        maybeSingle: async () => {
          const out = h.memberships.filter((r: any) => filters.every((f) => f(r)));
          return { data: out[0] ?? null, error: null };
        },
        then: (res: any) => {
          if (op === "delete") {
            h.memberships = h.memberships.filter((r: any) => !filters.every((f) => f(r)));
            return Promise.resolve({ error: null }).then(res);
          }
          return Promise.resolve({ data: null, error: null }).then(res);
        },
      };
      return b;
    },
  });
  return h;
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: async () => h.caller }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/billing/memberLimits", () => ({ memberLimit: () => 999, canAddMember: () => true }));
vi.mock("@/lib/audit/certificateLog", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: () => ({ admin: h.makeAdmin() }) }));

import { DELETE } from "../route";

function delReq(body: any) {
  return { json: async () => body } as any;
}

beforeEach(() => {
  h.caller = { userId: "33333333-3333-4333-8333-333333333333", tenantId: CALLER_TENANT, role: "admin" };
  h.memberships = [
    { user_id: OWNER_ID, tenant_id: CALLER_TENANT, role: "owner" },
    { user_id: STAFF_ID, tenant_id: CALLER_TENANT, role: "staff" },
  ];
});

describe("DELETE /api/admin/members", () => {
  it("admin はオーナーを削除できない (A-H2 回帰確認)", async () => {
    const res: any = await DELETE(delReq({ user_id: OWNER_ID }));
    expect(res.status).toBe(400);
    expect(h.memberships.some((m: any) => m.user_id === OWNER_ID)).toBe(true);
  });

  it("admin は staff を削除できる", async () => {
    const res: any = await DELETE(delReq({ user_id: STAFF_ID }));
    expect(res.status).toBe(200);
    expect(h.memberships.some((m: any) => m.user_id === STAFF_ID)).toBe(false);
  });
});
