/**
 * 運営の「施工店の設備・資格の検証済み」付与・解除 API のテスト。
 * 認証ゲート (isPlatformAdmin) / verified_at・verified_by の付与と解除 / 監査ログ / 異常系を確かめる。
 * createPlatformScopedAdmin は in-memory store に差し替え (service-role 相当)。
 * 施工店から変えられないこと・中身の書き換えで外れることは DB トリガの役目で、
 * scripts/replay/checks/workshop_profiles_verified_at_lock.sql が確かめる。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const T1 = "11111111-1111-4111-8111-111111111111";
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
    workshop_capability_profiles: [
      {
        id: "wp1",
        tenant_id: T1,
        verified_at: null,
        verified_by: null,
        updated_at: "2026-10-16",
        tenants: { name: "施工店A" },
      },
    ],
    admin_audit_logs: [],
  };
});

describe("GET /api/admin/platform/workshop-profiles", () => {
  it("運営は一覧を取得でき、施工店名が平らに入る", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/platform/workshop-profiles"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profiles[0].tenant_name).toBe("施工店A");
    expect(json.profiles[0]).not.toHaveProperty("tenants");
  });

  it("非運営は 403", async () => {
    h.isPlatform = false;
    const res = await GET(new NextRequest("http://localhost/api/admin/platform/workshop-profiles"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/platform/workshop-profiles (検証済みの付与・解除)", () => {
  it("運営は検証済みにでき、検証者は操作した運営で、監査ログが残る", async () => {
    const res = await POST(postReq({ tenant_id: T1, verified: true }));
    expect(res.status).toBe(200);
    const row = h.store.workshop_capability_profiles[0];
    expect(row.verified_at).toEqual(expect.any(String));
    expect(row.verified_by).toBe("u1");
    const log = h.store.admin_audit_logs[0];
    expect(log.action).toBe("platform.workshop_profile.verify");
    expect(log.target_id).toBe("wp1");
  });

  it("外すと verified_at・verified_by とも NULL に戻る", async () => {
    Object.assign(h.store.workshop_capability_profiles[0], { verified_at: "2026-10-01", verified_by: "u0" });
    const res = await POST(postReq({ tenant_id: T1, verified: false }));
    expect(res.status).toBe(200);
    const row = h.store.workshop_capability_profiles[0];
    expect(row.verified_at).toBeNull();
    expect(row.verified_by).toBeNull();
    expect(h.store.admin_audit_logs[0].action).toBe("platform.workshop_profile.unverify");
  });

  it("非運営は 403 で変更されない", async () => {
    h.isPlatform = false;
    const res = await POST(postReq({ tenant_id: T1, verified: true }));
    expect(res.status).toBe(403);
    expect(h.store.workshop_capability_profiles[0].verified_at).toBeNull();
  });

  it("不正な body は 400", async () => {
    const res = await POST(postReq({ tenant_id: "not-a-uuid", verified: true }));
    expect(res.status).toBe(400);
  });

  it("設備・資格が無い施工店は 404", async () => {
    const res = await POST(postReq({ tenant_id: MISSING, verified: true }));
    expect(res.status).toBe(404);
  });
});
