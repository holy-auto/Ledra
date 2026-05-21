/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(null),
  createInvoicePaymentLink: vi.fn(),
  sendCustomerLineText: vi.fn(),
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
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/stripe/invoicePaymentLink", () => ({ createInvoicePaymentLink: mocks.createInvoicePaymentLink }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("stripe", () => ({
  default: class StripeMock {
    constructor() {}
  },
}));

import { POST } from "@/app/api/admin/invoices/[id]/send-line-payment-link/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const VIEWER_A = { userId: "u2", tenantId: TENANT_A, role: "viewer", planTier: "pro" };
const INV_ID = "22222222-2222-42d2-a222-222222222222";

beforeEach(() => {
  mocks.resolveCallerWithRole.mockReset();
  mocks.createTenantScopedAdmin.mockReset();
  mocks.createInvoicePaymentLink.mockReset();
  mocks.sendCustomerLineText.mockReset();
});

function makeReq() {
  return new Request(`http://localhost/api/admin/invoices/${INV_ID}/send-line-payment-link`, {
    method: "POST",
  }) as any;
}
function makeCtx() {
  return { params: Promise.resolve({ id: INV_ID }) };
}

/** Builder for the fluent supabase mock used in these tests. */
function buildAdmin(tables: Record<string, { data: unknown; error: unknown }>) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const b: any = {
        select() {
          return b;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return b;
        },
        async maybeSingle() {
          return tables[table] ?? { data: null, error: null };
        },
      };
      return b;
    },
  };
}

describe("POST /api/admin/invoices/[id]/send-line-payment-link", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is below staff role", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(VIEWER_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({ admin: buildAdmin({}) });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
  });

  it("returns 403 when tenant has no Stripe Connect", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: null, stripe_connect_onboarded: false },
          error: null,
        },
      }),
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(403);
  });

  it("returns 404 when invoice does not exist", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: "acct_1", stripe_connect_onboarded: true },
          error: null,
        },
        documents: { data: null, error: null },
      }),
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("rejects paid invoice", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: "acct_1", stripe_connect_onboarded: true },
          error: null,
        },
        documents: {
          data: {
            id: INV_ID,
            doc_number: "INV-1",
            doc_type: "invoice",
            status: "paid",
            total: 1000,
            customer_id: "cust-1",
          },
          error: null,
        },
      }),
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(400);
  });

  it("rejects when customer has no LINE link", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: "acct_1", stripe_connect_onboarded: true },
          error: null,
        },
        documents: {
          data: {
            id: INV_ID,
            doc_number: "INV-1",
            doc_type: "invoice",
            status: "sent",
            total: 5000,
            customer_id: "cust-1",
            recipient_name: "山田",
          },
          error: null,
        },
        customers: { data: { id: "cust-1", name: "山田太郎", line_user_id: null }, error: null },
      }),
    });
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(400);
  });

  it("creates payment link, sends LINE, returns delivered=true on success", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: "acct_1", stripe_connect_onboarded: true },
          error: null,
        },
        documents: {
          data: {
            id: INV_ID,
            doc_number: "INV-1",
            doc_type: "invoice",
            status: "sent",
            total: 5000,
            customer_id: "cust-1",
            recipient_name: "山田",
          },
          error: null,
        },
        customers: { data: { id: "cust-1", name: "山田太郎", line_user_id: "U123" }, error: null },
      }),
    });
    mocks.createInvoicePaymentLink.mockResolvedValueOnce({
      checkoutUrl: "https://stripe/checkout/x",
      sessionId: "sess_1",
      applicationFee: 50,
      totalYen: 5000,
    });
    mocks.sendCustomerLineText.mockResolvedValueOnce(true);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { delivered: boolean; checkout_url: string; amount: number };
    expect(body.delivered).toBe(true);
    expect(body.checkout_url).toBe("https://stripe/checkout/x");
    expect(body.amount).toBe(5000);

    // LINE message included the URL and amount
    const lineCall = mocks.sendCustomerLineText.mock.calls[0][0];
    expect(lineCall.tenantId).toBe(TENANT_A);
    expect(lineCall.customerId).toBe("cust-1");
    expect(lineCall.lineUserId).toBe("U123");
    expect(lineCall.body).toContain("https://stripe/checkout/x");
    expect(lineCall.body).toContain("¥5,000");
  });

  it("returns delivered=false but still returns URL when LINE push fails", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        tenants: {
          data: { id: TENANT_A, name: "shop", stripe_connect_account_id: "acct_1", stripe_connect_onboarded: true },
          error: null,
        },
        documents: {
          data: {
            id: INV_ID,
            doc_number: "INV-1",
            doc_type: "invoice",
            status: "sent",
            total: 5000,
            customer_id: "cust-1",
            recipient_name: null,
          },
          error: null,
        },
        customers: { data: { id: "cust-1", name: "山田太郎", line_user_id: "U123" }, error: null },
      }),
    });
    mocks.createInvoicePaymentLink.mockResolvedValueOnce({
      checkoutUrl: "https://stripe/checkout/y",
      sessionId: "sess_2",
      applicationFee: 50,
      totalYen: 5000,
    });
    mocks.sendCustomerLineText.mockResolvedValueOnce(false);

    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { delivered: boolean; checkout_url: string };
    expect(body.delivered).toBe(false);
    expect(body.checkout_url).toBe("https://stripe/checkout/y");
  });
});
