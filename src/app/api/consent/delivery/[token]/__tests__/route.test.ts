import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELIVERY_CONSENT_VERSION, newConsentRequestToken } from "@/lib/delivery/deliveryConsent";

/** 承諾依頼リンク: トークンで引いた顧客に本人承諾を記録し、リンクを使用済みにする。 */
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
let staffTenant: string | null = null;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: async () => (staffTenant ? { tenantId: staffTenant } : null),
}));
let request: Record<string, unknown> | null;
let consent: unknown;
let lookedUpHash: unknown;
const upserts: unknown[] = [];
const updates: unknown[] = [];
const audits: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, v: unknown) => (col === "token_hash" && (lookedUpHash = v), q),
        maybeSingle: async () => ({ data: table === "delivery_consent_requests" ? request : consent, error: null }),
        // delivery_consents: 条件付き update / insert（upserts に積む）。delivery_consent_requests: 使用済みにする update。
        update: (row: unknown) => {
          (table === "delivery_consents" ? upserts : updates).push(row);
          const u: Record<string, unknown> = {
            eq: () => u,
            neq: () => u,
            is: async () => ({ error: null }),
            select: async () => ({ data: [{}], error: null }),
          };
          return u;
        },
        insert: async (row: Record<string, unknown>) => (
          (table === "audit_logs" ? audits : upserts).push(row),
          { error: null }
        ),
      };
      return q;
    },
  }),
}));

const { POST } = await import("../route");
const { token, tokenHash } = newConsentRequestToken();
const call = (body: unknown, t = token) =>
  POST(new Request(`https://app.example/api/consent/delivery/${t}`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ token: t }),
  });
const OK_BODY = { consent_version: DELIVERY_CONSENT_VERSION, agreed: true };
const future = () => new Date(Date.now() + 86_400_000).toISOString();

describe("POST /api/consent/delivery/[token]", () => {
  beforeEach(() => {
    request = {
      id: "req1",
      tenant_id: "t1",
      customer_id: "cust1",
      sent_via: "email",
      expires_at: future(),
      used_at: null,
      created_at: "2026-10-09T00:00:00Z",
    };
    staffTenant = null;
    consent = null;
    lookedUpHash = undefined;
    upserts.length = 0;
    updates.length = 0;
    audits.length = 0;
  });

  it("トークンのハッシュで依頼を引き、その顧客を本人承諾として記録し、使用済みにする", async () => {
    const res = await call(OK_BODY);
    expect(res.status).toBe(200);
    expect(lookedUpHash).toBe(tokenHash);
    expect(upserts).toEqual([
      expect.objectContaining({ tenant_id: "t1", customer_id: "cust1", status: "granted", granted_by: null }),
    ]);
    expect(updates).toEqual([expect.objectContaining({ used_at: expect.any(String) })]);
    expect(audits[0]).toMatchObject({
      action: "delivery_consent_granted_by_customer",
      query_json: expect.objectContaining({ via: "link", request_id: "req1", sent_via: "email" }),
    });
  });

  it("使用済み・期限切れ・存在しないリンクでは記録しない", async () => {
    request = { ...request, used_at: new Date().toISOString() };
    expect((await call(OK_BODY)).status).toBe(409);
    request = { ...request, used_at: null, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect((await call(OK_BODY)).status).toBe(404);
    request = null;
    expect((await call(OK_BODY)).status).toBe(404);
    expect((await call(OK_BODY, "short")).status).toBe(404);
    expect(upserts).toEqual([]);
  });

  it("チェックが無い・文言の版が古いときは記録しない", async () => {
    expect((await call({ consent_version: DELIVERY_CONSENT_VERSION })).status).toBe(400);
    expect((await call({ consent_version: "old", agreed: true })).status).toBe(409);
    expect(upserts).toEqual([]);
  });

  it("既に承諾済みなら上書きしない（店舗の記録を残す）が、リンクは使用済みにする", async () => {
    consent = { status: "granted", revoked_at: null, revoked_via: null };
    expect((await call(OK_BODY)).status).toBe(200);
    expect(upserts).toEqual([]);
    expect(updates).toHaveLength(1);
  });

  it("リンク発行後に撤回されていたら、古いリンクで承諾に戻さない", async () => {
    consent = { status: "revoked", revoked_at: "2026-10-10T00:00:00Z", revoked_via: "admin" };
    expect((await call(OK_BODY)).status).toBe(409);
    expect(upserts).toEqual([]);
    // 発行前の撤回なら、お客様の再承諾として記録する
    consent = { status: "revoked", revoked_at: "2026-10-01T00:00:00Z", revoked_via: "customer" };
    expect((await call(OK_BODY)).status).toBe(200);
    expect(upserts).toHaveLength(1);
  });

  it("発行した店舗のアカウントでログイン中の端末からは記録しない", async () => {
    staffTenant = "t1";
    expect((await call(OK_BODY)).status).toBe(403);
    expect(upserts).toEqual([]);
    staffTenant = "other-tenant";
    expect((await call(OK_BODY)).status).toBe(200);
  });
});
