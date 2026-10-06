import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELIVERY_CONSENT_VERSION } from "@/lib/delivery/deliveryConsent";

/** 使用者本人の電子交付承諾: 現行の文言版でだけ、セッションの顧客に「本人・ポータル」として記録する。 */
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "tok" }) }) }));
let session: { customer_id: string | null } | null;
vi.mock("@/lib/customerPortalServer", () => ({
  CUSTOMER_COOKIE: "c",
  getTenantIdBySlug: async () => "t1",
  validateSession: async () => session,
}));
const upserts: unknown[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => ({ upsert: async (row: unknown) => (upserts.push(row), { error: null }) }),
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

describe("POST /api/customer/delivery-consent/grant", () => {
  beforeEach(() => {
    session = { customer_id: "cust1" };
    upserts.length = 0;
  });

  it("現行の文言版なら、セッションの顧客を本人承諾として記録する（撤回情報は消す）", async () => {
    const res = await call({ tenant_slug: "shop", consent_version: DELIVERY_CONSENT_VERSION });
    expect(res.status).toBe(200);
    expect(upserts).toEqual([
      expect.objectContaining({
        tenant_id: "t1",
        customer_id: "cust1",
        status: "granted",
        method: "customer_portal",
        consent_version: DELIVERY_CONSENT_VERSION,
        granted_by: null,
        revoked_at: null,
        revoked_via: null,
      }),
    ]);
  });
  it("文言の版が違えば 409 で記録しない", async () => {
    expect((await call({ tenant_slug: "shop", consent_version: "old-v0" })).status).toBe(409);
    expect(upserts).toEqual([]);
  });
  it("顧客に紐付かないセッションは 401 で記録しない", async () => {
    session = { customer_id: null };
    expect((await call({ tenant_slug: "shop", consent_version: DELIVERY_CONSENT_VERSION })).status).toBe(401);
    expect(upserts).toEqual([]);
  });
});
