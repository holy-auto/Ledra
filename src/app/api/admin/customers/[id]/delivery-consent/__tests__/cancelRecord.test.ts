import { describe, it, expect, vi, beforeEach } from "vitest";

/** 押し間違えた「店舗の記録」の取り消し: 店舗が記録した承諾だけを消して未承諾に戻す。本人の承諾は消せない。 */
const CUST = "11111111-1111-1111-1111-111111111111";
vi.mock("@/lib/api/withCaller", () => ({
  withCaller:
    (h: (req: Request, ctx: unknown) => Promise<Response>) =>
    async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
      h(req, { caller: { tenantId: "t1", userId: "u1" }, params: await ctx.params }),
}));
let consent: Record<string, unknown> | null;
const deletes: string[] = [];
const upserts: unknown[] = [];
const audits: Record<string, unknown>[] = [];
vi.mock("@/lib/audit/tenantLog", () => ({
  logTenantAuditEvent: async (_db: unknown, e: Record<string, unknown>) => void audits.push(e),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: (table: string) => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          not: async () => (deletes.push(table), { error: null }),
          maybeSingle: async () => ({ data: table === "customers" ? { id: CUST } : consent, error: null }),
          delete: () => q,
          upsert: async (row: unknown) => (upserts.push(row), { error: null }),
        };
        return q;
      },
    },
  }),
}));

const { DELETE } = await import("../route");
const call = (query = "") =>
  (DELETE as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`https://app.example/api/admin/customers/${CUST}/delivery-consent${query}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: CUST }) },
  );

describe("DELETE /api/admin/customers/[id]/delivery-consent?mode=cancel_record", () => {
  beforeEach(() => {
    consent = null;
    deletes.length = 0;
    upserts.length = 0;
    audits.length = 0;
  });

  it("店舗が記録した承諾は消して未承諾に戻し、消した中身を監査ログに残す", async () => {
    consent = { status: "granted", granted_by: "u9", granted_at: "2026-10-09T15:40:00Z" };
    const res = await call("?mode=cancel_record");
    expect(res.status).toBe(200);
    expect(deletes).toEqual(["delivery_consents"]);
    expect(upserts).toEqual([]);
    expect(audits[0]).toMatchObject({
      action: "delivery_consent_record_cancelled_by_shop",
      extra: { cancelled: expect.objectContaining({ granted_by: "u9" }) },
    });
  });

  it("お客様本人の承諾・未承諾・撤回済みは取り消せない", async () => {
    for (const c of [{ status: "granted", granted_by: null }, null, { status: "revoked", granted_by: "u9" }]) {
      consent = c;
      expect((await call("?mode=cancel_record")).status).toBe(409);
    }
    expect(deletes).toEqual([]);
  });

  it("mode が無ければ従来どおり撤回として記録する", async () => {
    consent = { status: "granted", granted_by: "u9" };
    expect((await call()).status).toBe(200);
    expect(deletes).toEqual([]);
    expect(upserts).toEqual([expect.objectContaining({ status: "revoked", revoked_via: "admin" })]);
  });
});
