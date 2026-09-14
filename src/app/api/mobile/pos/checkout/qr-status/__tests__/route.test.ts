/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * code-review 指摘の回帰確認 (2026-09-08): Connect 未オンボーディングの
 * テナントは stripeOptions が undefined になり、プラットフォーム共有
 * アカウントへ直接問い合わせる。session_id はクライアント入力で所有権
 * チェックが無かったため、他テナントの session_id を知っていれば
 * 状態・金額・PaymentIntent ID を読めた。metadata.tenant_id との突合で
 * 塞ぐ。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  requireMinRole: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/auth/checkRole", () => ({ requireMinRole: mocks.requireMinRole }));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }),
}));

const CALLER_TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";

function tenantAdmin(row: { stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean }) {
  const admin: any = {
    from: () => admin,
    select: () => admin,
    eq: () => admin,
    single: async () => ({ data: row, error: null }),
  };
  return { admin };
}

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => tenantAdmin({ stripe_connect_account_id: null, stripe_connect_onboarded: false }),
}));

import { GET } from "../route";

function makeReq(sessionId: string) {
  return new NextRequest(`http://x/api/mobile/pos/checkout/qr-status?session_id=${sessionId}`);
}

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
  mocks.requireMinRole.mockReset();
  mocks.requireMinRole.mockReturnValue(true);
  mocks.retrieve.mockReset();
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
});

describe("GET /api/mobile/pos/checkout/qr-status", () => {
  it("404 when the session belongs to a different tenant (未オンボーディング=プラットフォーム共有アカウント経由)", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({ tenantId: CALLER_TENANT, role: "staff" });
    mocks.retrieve.mockResolvedValueOnce({
      metadata: { tenant_id: OTHER_TENANT },
      payment_status: "paid",
      status: "complete",
      payment_intent: "pi_other_tenant",
      amount_total: 50000,
    });

    const res: any = await GET(makeReq("cs_other_tenant_session"));
    expect(res.status).toBe(404);
  });

  it("200 with status=paid when the session belongs to the caller's own tenant", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({ tenantId: CALLER_TENANT, role: "staff" });
    mocks.retrieve.mockResolvedValueOnce({
      metadata: { tenant_id: CALLER_TENANT },
      payment_status: "paid",
      status: "complete",
      payment_intent: "pi_own_tenant",
      amount_total: 12000,
    });

    const res: any = await GET(makeReq("cs_own_tenant_session"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paid");
    expect(body.payment_intent_id).toBe("pi_own_tenant");
  });

  it("401 when unauthenticated", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce(null);
    const res: any = await GET(makeReq("cs_x"));
    expect(res.status).toBe(401);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});
