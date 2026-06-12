/* eslint-disable @typescript-eslint/no-explicit-any */
// Polymorphic supabase query-builder mock; the chained shape demands `any`
// in a few helper signatures. Production error paths stay strict-typed.
//
// クーポン使用 (POST /api/admin/coupons/[id]/use) の検証:
//  - 認証 / 権限 (401 / 403)
//  - 他テナント / 不存在の発行レコード (404)
//  - 二重利用ガード: status='issued' compare-and-set ミスで 409
//  - 正常系: issue を used に遷移し used_count を +1

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requireMinRole: (caller: { role: string }, minRole: string) => {
    const rank: Record<string, number> = { super_admin: 5, owner: 4, admin: 3, staff: 2, viewer: 1 };
    return (rank[caller.role] ?? 0) >= (rank[minRole] ?? 0);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/admin/coupons/[id]/use/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };
const COUPON_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ISSUE_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

type TableHandlers = {
  onSelect?: (filters: Record<string, unknown>) => { data: unknown; error: unknown };
  onUpdate?: (patch: Record<string, unknown>, filters: Record<string, unknown>) => { data: unknown; error: unknown };
};

function buildAdmin(opts: {
  tables: Record<string, TableHandlers>;
  recordUpdates?: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[];
}) {
  const recordUpdates = opts.recordUpdates ?? [];
  return {
    from(table: string) {
      const handlers = opts.tables[table];
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        order() {
          return builder;
        },
        async maybeSingle() {
          const r = handlers?.onSelect?.(filters) ?? { data: null, error: null };
          return { data: r.data, error: r.error };
        },
        async single() {
          const r = handlers?.onSelect?.(filters) ?? { data: null, error: null };
          return { data: r.data, error: r.error };
        },
        update(patch: Record<string, unknown>) {
          const updFilters: Record<string, unknown> = {};
          const updBuilder: any = {
            eq(col: string, val: unknown) {
              updFilters[col] = val;
              return updBuilder;
            },
            select() {
              return updBuilder;
            },
            async maybeSingle() {
              recordUpdates.push({ table, patch, filters: { ...updFilters } });
              const r = handlers?.onUpdate?.(patch, { ...updFilters }) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
            then(resolve: (v: any) => any, reject?: (e: any) => any) {
              try {
                recordUpdates.push({ table, patch, filters: { ...updFilters } });
                const r = handlers?.onUpdate?.(patch, { ...updFilters }) ?? { data: null, error: null };
                return Promise.resolve(r).then(resolve, reject);
              } catch (e) {
                return reject ? reject(e) : Promise.reject(e);
              }
            },
          };
          return updBuilder;
        },
      };
      return builder;
    },
  } as any;
}

function makeReq(body: unknown = {}) {
  return new Request(`http://localhost/api/admin/coupons/${COUPON_ID}/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const ctx = { params: Promise.resolve({ id: COUPON_ID }) };

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

describe("POST /api/admin/coupons/[id]/use", () => {
  it("401 when not authenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ issue_id: ISSUE_ID }), ctx);
    expect(res.status).toBe(401);
  });

  it("403 when caller is below staff", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    const res = await POST(makeReq({ issue_id: ISSUE_ID }), ctx);
    expect(res.status).toBe(403);
  });

  it("400 when issue_id is missing / invalid", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const res = await POST(makeReq({}), ctx);
    expect(res.status).toBe(400);
  });

  it("404 when the issue belongs to another tenant/coupon (scoped read returns null)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupon_issues: { onSelect: () => ({ data: null, error: null }) },
        },
      }),
    });
    const res = await POST(makeReq({ issue_id: ISSUE_ID }), ctx);
    expect(res.status).toBe(404);
  });

  it("400 when the issue is already used", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupon_issues: {
            onSelect: () => ({ data: { id: ISSUE_ID, coupon_id: COUPON_ID, status: "used" }, error: null }),
          },
        },
      }),
    });
    const res = await POST(makeReq({ issue_id: ISSUE_ID }), ctx);
    expect(res.status).toBe(400);
  });

  it("marks the issue used and increments coupons.used_count", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const recordUpdates: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        recordUpdates,
        tables: {
          coupon_issues: {
            onSelect: () => ({ data: { id: ISSUE_ID, coupon_id: COUPON_ID, status: "issued" }, error: null }),
            onUpdate: (patch) => ({
              data: { id: ISSUE_ID, coupon_id: COUPON_ID, status: patch.status, used_at: patch.used_at },
              error: null,
            }),
          },
          coupons: {
            // read-modify-write: 現在の used_count を読む → +1 して書き戻す
            onSelect: () => ({ data: { used_count: 4 }, error: null }),
            onUpdate: (patch) => ({ data: { id: COUPON_ID, used_count: patch.used_count, max_uses: 50 }, error: null }),
          },
        },
      }),
    });

    const res = await POST(makeReq({ issue_id: ISSUE_ID, discount_applied: 1000 }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { issue: { status: string }; coupon: { used_count: number } };
    expect(body.issue.status).toBe("used");
    expect(body.coupon.used_count).toBe(5);

    // compare-and-set: issue update guarded by status='issued' + tenant scope
    const issueUpd = recordUpdates.find((u) => u.table === "coupon_issues");
    expect(issueUpd?.patch.status).toBe("used");
    expect(issueUpd?.filters.tenant_id).toBe(TENANT_A);
    expect(issueUpd?.filters.status).toBe("issued");

    // used_count incremented from 4 -> 5 under tenant scope
    const couponUpd = recordUpdates.find((u) => u.table === "coupons");
    expect(couponUpd?.patch.used_count).toBe(5);
    expect(couponUpd?.filters.tenant_id).toBe(TENANT_A);
  });

  it("409 when a concurrent request already marked the issue used (compare-and-set miss)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupon_issues: {
            onSelect: () => ({ data: { id: ISSUE_ID, coupon_id: COUPON_ID, status: "issued" }, error: null }),
            // Update affects 0 rows -> returns null (status moved underneath us)
            onUpdate: () => ({ data: null, error: null }),
          },
        },
      }),
    });
    const res = await POST(makeReq({ issue_id: ISSUE_ID }), ctx);
    expect(res.status).toBe(409);
  });
});
