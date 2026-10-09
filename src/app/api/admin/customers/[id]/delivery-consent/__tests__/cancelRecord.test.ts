import { describe, it, expect, vi, beforeEach } from "vitest";

/** 押し間違えた「店舗の記録」の取り消し: 押す前の状態（未承諾 or 以前の撤回）に戻す。本人の承諾は消せない。 */
const CUST = "11111111-1111-1111-1111-111111111111";
vi.mock("@/lib/api/withCaller", () => ({
  withCaller:
    (h: (req: Request, ctx: unknown) => Promise<Response>) =>
    async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
      h(req, { caller: { tenantId: "t1", userId: "u1" }, params: await ctx.params }),
}));
let consent: Record<string, unknown> | null;
let affected: unknown[];
const writes: { kind: string; row?: unknown }[] = [];
const audits: Record<string, unknown>[] = [];
vi.mock("@/lib/audit/tenantLog", () => ({
  logTenantAuditEvent: async (_db: unknown, e: Record<string, unknown>) => void audits.push(e),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: (table: string) => {
        const w: Record<string, unknown> = {
          eq: () => w,
          not: () => w,
          select: async () => ({ data: affected, error: null }),
        };
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: table === "customers" ? { id: CUST } : consent, error: null }),
          delete: () => (writes.push({ kind: "delete" }), w),
          update: (row: unknown) => (writes.push({ kind: "update", row }), w),
          upsert: async (row: unknown) => (writes.push({ kind: "upsert", row }), { error: null }),
        };
        return q;
      },
    },
  }),
}));

const { DELETE } = await import("../route");
const call = async (query = "") => {
  const res = await (DELETE as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`https://app.example/api/admin/customers/${CUST}/delivery-consent${query}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: CUST }) },
  );
  return { status: res.status, body: await res.json().catch(() => null) };
};

describe("DELETE /api/admin/customers/[id]/delivery-consent?mode=cancel_record", () => {
  beforeEach(() => {
    consent = null;
    affected = [{ customer_id: CUST }];
    writes.length = 0;
    audits.length = 0;
  });

  it("記録の前に撤回が無ければ行を消して未承諾に戻し、消した中身を監査ログに残す", async () => {
    consent = { status: "granted", granted_by: "u9", revoked_at: null };
    const r = await call("?mode=cancel_record");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "none" });
    expect(writes).toEqual([{ kind: "delete" }]);
    expect(audits[0]).toMatchObject({
      action: "delivery_consent_record_cancelled_by_shop",
      extra: { cancelled: expect.objectContaining({ granted_by: "u9" }), restored: "none" },
    });
  });

  it("記録の前に撤回があれば、消さずに撤回へ戻す（撤回を押し間違いで消さない）", async () => {
    consent = { status: "granted", granted_by: "u9", revoked_at: "2026-10-01T00:00:00Z", revoked_via: "customer" };
    const r = await call("?mode=cancel_record");
    expect(r.body).toMatchObject({ status: "revoked" });
    expect(writes).toEqual([{ kind: "update", row: expect.objectContaining({ status: "revoked", granted_by: null }) }]);
  });

  it("本人の承諾・未承諾・撤回済みは取り消せない。読んだ後に状態が変わっていたら何もしない", async () => {
    for (const c of [{ status: "granted", granted_by: null }, null, { status: "revoked", granted_by: "u9" }]) {
      consent = c;
      expect((await call("?mode=cancel_record")).status).toBe(409);
    }
    expect(writes).toEqual([]);
    consent = { status: "granted", granted_by: "u9", revoked_at: null };
    affected = [];
    expect((await call("?mode=cancel_record")).status).toBe(409);
    expect(audits).toEqual([]);
  });

  it("知らない mode は撤回として扱わず 400。mode が無ければ従来どおり撤回", async () => {
    consent = { status: "granted", granted_by: "u9" };
    expect((await call("?mode=cancel-record")).status).toBe(400);
    expect(writes).toEqual([]);
    expect((await call()).status).toBe(200);
    expect(writes).toEqual([
      { kind: "upsert", row: expect.objectContaining({ status: "revoked", revoked_via: "admin" }) },
    ]);
  });
});
