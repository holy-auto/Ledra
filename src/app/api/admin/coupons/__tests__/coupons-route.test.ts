/* eslint-disable @typescript-eslint/no-explicit-any */
// クーポン作成 (POST) と発行 (POST /[id]/issue) の検証:
//  - POST: code 自動生成 / percent 1-100 バリデーション / RBAC / UNIQUE 衝突
//  - issue: 上限到達クーポンの発行ブロック / 発行レコード作成

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

import { POST as CREATE } from "@/app/api/admin/coupons/route";
import { POST as ISSUE } from "@/app/api/admin/coupons/[id]/issue/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };
const COUPON_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

type TableHandlers = {
  onSelect?: (filters: Record<string, unknown>) => { data: unknown; error: unknown };
  onInsert?: (rows: any) => { data: unknown; error: unknown };
};

function buildAdmin(opts: { tables: Record<string, TableHandlers>; capturedInserts?: Record<string, any[]> }) {
  const capturedInserts = opts.capturedInserts ?? {};
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
        insert(rows: any) {
          (capturedInserts[table] ??= []).push(rows);
          const insBuilder: any = {
            select() {
              return insBuilder;
            },
            async single() {
              const r = handlers?.onInsert?.(rows) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
            async maybeSingle() {
              const r = handlers?.onInsert?.(rows) ?? { data: null, error: null };
              return { data: r.data, error: r.error };
            },
          };
          return insBuilder;
        },
      };
      return builder;
    },
  } as any;
}

function makeCreateReq(body: unknown) {
  return new Request("http://localhost/api/admin/coupons", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}
function makeIssueReq(body: unknown) {
  return new Request(`http://localhost/api/admin/coupons/${COUPON_ID}/issue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}
const issueCtx = { params: Promise.resolve({ id: COUPON_ID }) };

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

describe("POST /api/admin/coupons (create)", () => {
  it("403 when caller is below staff", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    const res = await CREATE(makeCreateReq({ name: "X", discount_value: 10 }));
    expect(res.status).toBe(403);
  });

  it("400 when percent discount is out of 1-100 range", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const res = await CREATE(makeCreateReq({ name: "X", discount_type: "percent", discount_value: 150 }));
    expect(res.status).toBe(400);
  });

  it("auto-generates an 8-char A-Z/0-9 code when none provided", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const capturedInserts: Record<string, any[]> = {};
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        capturedInserts,
        tables: {
          // uniqueness pre-check returns null (no dup) so first candidate is accepted
          coupons: {
            onSelect: () => ({ data: null, error: null }),
            onInsert: (rows) => ({
              data: { id: COUPON_ID, ...rows, used_count: 0, is_active: true },
              error: null,
            }),
          },
        },
      }),
    });

    const res = await CREATE(makeCreateReq({ name: "初回10%", discount_type: "fixed", discount_value: 1000 }));
    expect(res.status).toBe(201);
    const inserted = capturedInserts.coupons?.[0];
    expect(inserted.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(inserted.tenant_id).toBe(TENANT_A);
    expect(inserted.used_count).toBe(0);
  });

  it("uppercases a user-provided code", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const capturedInserts: Record<string, any[]> = {};
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        capturedInserts,
        tables: {
          coupons: {
            onInsert: (rows) => ({ data: { id: COUPON_ID, ...rows }, error: null }),
          },
        },
      }),
    });
    const res = await CREATE(makeCreateReq({ code: "welcome10", name: "X", discount_value: 500 }));
    expect(res.status).toBe(201);
    expect(capturedInserts.coupons?.[0].code).toBe("WELCOME10");
  });

  it("400 on UNIQUE (tenant_id, code) violation for a user-provided code", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupons: {
            onInsert: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
          },
        },
      }),
    });
    const res = await CREATE(makeCreateReq({ code: "DUP", name: "X", discount_value: 500 }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/coupons/[id]/issue", () => {
  it("404 when the coupon belongs to another tenant", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({ tables: { coupons: { onSelect: () => ({ data: null, error: null }) } } }),
    });
    const res = await ISSUE(makeIssueReq({}), issueCtx);
    expect(res.status).toBe(404);
  });

  it("400 when the coupon is inactive", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupons: {
            onSelect: () => ({
              data: { id: COUPON_ID, is_active: false, max_uses: null, used_count: 0, valid_until: null },
              error: null,
            }),
          },
        },
      }),
    });
    const res = await ISSUE(makeIssueReq({}), issueCtx);
    expect(res.status).toBe(400);
  });

  it("400 when the coupon has reached its usage cap", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tables: {
          coupons: {
            onSelect: () => ({
              data: { id: COUPON_ID, is_active: true, max_uses: 50, used_count: 50, valid_until: null },
              error: null,
            }),
          },
        },
      }),
    });
    const res = await ISSUE(makeIssueReq({}), issueCtx);
    expect(res.status).toBe(400);
  });

  it("creates an issue row with computed expires_at and does NOT bump used_count", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    const capturedInserts: Record<string, any[]> = {};
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        capturedInserts,
        tables: {
          coupons: {
            onSelect: () => ({
              data: { id: COUPON_ID, is_active: true, max_uses: 50, used_count: 3, valid_until: null },
              error: null,
            }),
          },
          customers: { onSelect: () => ({ data: { id: CUSTOMER_ID }, error: null }) },
          coupon_issues: {
            onInsert: (rows) => ({ data: { id: "issue-1", ...rows }, error: null }),
          },
        },
      }),
    });

    const res = await ISSUE(
      makeIssueReq({ customer_id: CUSTOMER_ID, expires_days: 30, issue_channel: "line" }),
      issueCtx,
    );
    expect(res.status).toBe(201);
    const inserted = capturedInserts.coupon_issues?.[0];
    expect(inserted.coupon_id).toBe(COUPON_ID);
    expect(inserted.tenant_id).toBe(TENANT_A);
    expect(inserted.customer_id).toBe(CUSTOMER_ID);
    expect(inserted.status).toBe("issued");
    expect(inserted.issue_channel).toBe("line");
    expect(typeof inserted.expires_at).toBe("string"); // 30日後の ISO
    // coupons テーブルへの INSERT/used_count 加算は発生しない (使用時に行う)
    expect(capturedInserts.coupons).toBeUndefined();
  });
});
