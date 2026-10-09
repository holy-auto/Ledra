/* eslint-disable @typescript-eslint/no-explicit-any */
// 旧 /api/admin/invoices の PUT からも、合算請求書にまとめて取消扱いになった請求書を戻させない（二重計上の別の入口）。
import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: null as any }));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: vi.fn(async () => ({ userId: "u1", tenantId: "t1", role: "admin", planTier: "pro" })),
  requireMinRole: () => true,
  requirePermission: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: () => ({ admin: mocks.admin }) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { PUT } from "@/app/api/admin/invoices/route";

const ID = "11111111-1111-4111-8111-111111111111";

function admin(meta: unknown) {
  const calls: { update?: unknown } = {};
  const b: any = {
    select: () => b,
    eq: () => b,
    update: (p: unknown) => {
      calls.update = p;
      return b;
    },
    maybeSingle: async () => ({ data: { meta_json: meta }, error: null }),
    single: async () => ({ data: { id: ID, doc_type: "invoice", status: "sent" }, error: null }),
  };
  return { calls, from: () => b };
}

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/admin/invoices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as any,
  );

describe("PUT /api/admin/invoices（合算済みの請求書）", () => {
  it("合算請求書にまとめた請求書のステータスは変えさせない", async () => {
    mocks.admin = admin({ consolidated_into: "cinv-1" });
    const res = await put({ id: ID, status: "sent" });
    expect(res.status).toBe(400);
    expect(mocks.admin.calls.update).toBeUndefined();
  });

  it("合算していない請求書は従来どおり変えられる", async () => {
    mocks.admin = admin({});
    const res = await put({ id: ID, status: "sent" });
    expect(res.status).toBe(200);
    expect(mocks.admin.calls.update).toMatchObject({ status: "sent" });
  });
});
