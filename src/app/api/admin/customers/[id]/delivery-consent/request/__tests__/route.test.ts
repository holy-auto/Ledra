import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashConsentRequestToken } from "@/lib/delivery/deliveryConsent";

/** 承諾のお願いの発行: 承諾済み・連絡先なしは断り、トークンはハッシュだけ保存し、届いたら URL を返さない。 */
const CUST = "11111111-1111-1111-1111-111111111111";
vi.mock("@/lib/api/withCaller", () => ({
  withCaller:
    (h: (req: Request, ctx: unknown) => Promise<Response>) =>
    async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
      h(req, { caller: { tenantId: "t1", userId: "u1" }, params: await ctx.params }),
}));
let customer: Record<string, unknown> | null;
let consent: unknown;
const inserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: (table: string) => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: table === "customers" ? customer : table === "delivery_consents" ? consent : { name: "テスト整備" },
            error: null,
          }),
          insert: (row: Record<string, unknown>) => (
            inserts.push(row),
            { select: () => ({ single: async () => ({ data: { id: "req1" }, error: null }) }) }
          ),
        };
        return q;
      },
    },
  }),
}));
vi.mock("@/lib/audit/tenantLog", () => ({ logTenantAuditEvent: async () => {} }));
let emailOk = true;
const emails: Record<string, unknown>[] = [];
vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: async (m: Record<string, unknown>) => (emails.push(m), { ok: emailOk }),
}));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: async () => true }));
vi.mock("@/lib/url", () => ({ resolveBaseUrl: () => "https://app.example" }));

const { POST } = await import("../route");
const call = (send: string) =>
  (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`https://app.example/api/admin/customers/${CUST}/delivery-consent/request`, {
      method: "POST",
      body: JSON.stringify({ send }),
    }),
    { params: Promise.resolve({ id: CUST }) },
  );

describe("POST /api/admin/customers/[id]/delivery-consent/request", () => {
  beforeEach(() => {
    customer = { id: CUST, name: "山田", email: "a@example.com", line_user_id: null };
    consent = null;
    inserts.length = 0;
    emails.length = 0;
    emailOk = true;
  });

  it("リンクを作ると、URL のトークンは平文で保存せずハッシュだけ保存する", async () => {
    const j = await (await call("link")).json();
    const token = String(j.url).split("/consent/delivery/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inserts[0]).toMatchObject({
      tenant_id: "t1",
      customer_id: CUST,
      token_hash: hashConsentRequestToken(token),
    });
    expect(JSON.stringify(inserts[0])).not.toContain(token);
  });

  it("メールで届いたら URL を返さない。届かなければ手渡し用に返す", async () => {
    let j = await (await call("email")).json();
    expect(emails[0]).toMatchObject({ to: "a@example.com" });
    expect(j).toMatchObject({ delivered: true, url: null });
    emailOk = false;
    j = await (await call("email")).json();
    expect(j.delivered).toBe(false);
    expect(j.url).toContain("/consent/delivery/");
  });

  it("承諾済みの顧客・連絡先が無い送り方は断り、リンクを作らない", async () => {
    consent = { status: "granted" };
    expect((await call("link")).status).toBe(409);
    consent = null;
    expect((await call("line")).status).toBe(400);
    customer = { ...customer, email: null };
    expect((await call("email")).status).toBe(400);
    expect(inserts).toEqual([]);
  });
});
