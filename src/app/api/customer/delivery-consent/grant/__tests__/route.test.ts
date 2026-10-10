import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELIVERY_CONSENT_VERSION } from "@/lib/delivery/deliveryConsent";

/** 使用者本人の電子交付承諾: 現行の文言版でだけ、セッションの顧客に本人承諾として記録する。 */
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "tok" }) }) }));
let session: { customer_id: string | null } | null;
vi.mock("@/lib/customerPortalServer", () => ({
  CUSTOMER_COOKIE: "c",
  getTenantIdBySlug: async () => "t1",
  validateSession: async () => session,
}));
let current: unknown;
const upserts: unknown[] = [];
const audits: unknown[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: current, error: null }),
        // 承諾の書き込みは、行が無ければ insert・あれば「承諾済みでない」条件付きの update。どちらも upserts に積む。
        update: (row: unknown) => {
          upserts.push(row);
          const u: Record<string, unknown> = {
            eq: () => u,
            or: () => u,
            select: async () => ({ data: [{}], error: null }),
          };
          return u;
        },
        insert: async (row: unknown) => ((table === "audit_logs" ? audits : upserts).push(row), { error: null }),
      };
      return q;
    },
  }),
}));

const { POST } = await import("../route");
const call = (body: unknown) =>
  POST(
    new Request("https://app.example/api/customer/delivery-consent/grant", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const OK_BODY = { tenant_slug: "shop", consent_version: DELIVERY_CONSENT_VERSION };

describe("POST /api/customer/delivery-consent/grant", () => {
  beforeEach(() => {
    session = { customer_id: "cust1" };
    current = null;
    upserts.length = 0;
    audits.length = 0;
  });

  it("未承諾なら、セッションの顧客を本人承諾（granted_by=null）として記録する", async () => {
    const res = await call(OK_BODY);
    expect(res.status).toBe(200);
    expect(upserts).toEqual([
      expect.objectContaining({
        tenant_id: "t1",
        customer_id: "cust1",
        status: "granted",
        method: null,
        note: null,
        consent_version: DELIVERY_CONSENT_VERSION,
        granted_by: null,
        revoked_at: null,
      }),
    ]);
  });
  it("撤回後の再承諾は、撤回の記録を監査ログに残す", async () => {
    current = { status: "revoked", revoked_at: "2026-10-01T00:00:00Z", revoked_via: "customer" };
    await call(OK_BODY);
    await Promise.resolve();
    expect(audits).toEqual([
      expect.objectContaining({
        action: "delivery_consent_granted_by_customer",
        query_json: expect.objectContaining({
          previous_status: "revoked",
          previous_revoked_at: "2026-10-01T00:00:00Z",
        }),
      }),
    ]);
  });
  it("既に承諾済みなら上書きしない（店舗が記録した承諾を消さない）", async () => {
    current = { status: "granted", revoked_at: null, revoked_via: null };
    expect((await call(OK_BODY)).status).toBe(200);
    expect(upserts).toEqual([]);
  });
  it("文言の版が違えば 409 で記録しない", async () => {
    expect((await call({ ...OK_BODY, consent_version: "old-v0" })).status).toBe(409);
    expect(upserts).toEqual([]);
  });
  it("顧客に紐付かないセッションは 401 で記録しない", async () => {
    session = { customer_id: null };
    expect((await call(OK_BODY)).status).toBe(401);
    expect(upserts).toEqual([]);
  });
});
