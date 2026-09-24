import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 課金の操作（checkout / portal / resume）は
 *  - 選択中テナント（active_tenant_id Cookie）の契約に対して行う
 *  - そのテナントのオーナーだけが行える（2026-09-24 代表判断）
 * ことを、ルートを実際に呼んで確かめる。
 *
 * 以前は tenant_memberships を `limit(1)` で引いており、複数テナント所属のユーザーが
 * 別テナントを選んでいても最初の所属テナントの契約を操作し、ロールも見ていなかった。
 */

const state = vi.hoisted(() => ({
  activeTenant: "t-B" as string | undefined,
  memberships: [] as Array<{ user_id: string; tenant_id: string; role: string }>,
  stripe: {
    checkoutCreate: vi.fn(async (_p: Record<string, unknown>) => ({ url: "https://stripe.test/checkout" })),
    portalCreate: vi.fn(async (_p: Record<string, unknown>) => ({ url: "https://stripe.test/portal" })),
    customersCreate: vi.fn(async () => ({ id: "cus_new" })),
  },
}));

function table(rows: Array<Record<string, unknown>>) {
  const filters: Record<string, unknown> = {};
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({
      data: rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null,
      error: null,
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
  };
  return b;
}

const TENANTS = [
  { id: "t-A", name: "A店", slug: "a", plan_tier: "standard", stripe_customer_id: "cus_A" },
  { id: "t-B", name: "B店", slug: "b", plan_tier: "standard", stripe_customer_id: "cus_B" },
];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "active_tenant_id" && state.activeTenant ? { value: state.activeTenant } : undefined,
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/billing/campaign", () => ({ resolveCampaign: async () => null }));
vi.mock("@/lib/stripe/plan", () => ({ planTierToPriceId: () => "price_test" }));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: state.stripe.checkoutCreate } },
    billingPortal: { sessions: { create: state.stripe.portalCreate } },
    customers: { create: state.stripe.customersCreate },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
    from: (t: string) => (t === "tenant_memberships" ? table(state.memberships) : table(TENANTS)),
  }),
}));

import { POST as checkout } from "../checkout/route";
import { POST as portal } from "../portal/route";
import { POST as resume } from "../resume/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("https://app.test/api/stripe/x", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.test" },
    body: JSON.stringify(body),
  });
}

const CALLS = [
  ["checkout", () => checkout(req({ access_token: "tok", plan_tier: "pro" }))],
  ["portal", () => portal(req({ access_token: "tok" }))],
  ["resume", () => resume(req({ access_token: "tok" }))],
] as const;

describe("課金の操作は選択中テナントのオーナーのみ", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://app.test";
    state.activeTenant = "t-B";
    state.stripe.checkoutCreate.mockClear();
    state.stripe.portalCreate.mockClear();
    // 最初の所属（t-A）はオーナー、選択中の t-B でのロールはテストごとに変える
    state.memberships = [
      { user_id: "u-1", tenant_id: "t-A", role: "owner" },
      { user_id: "u-1", tenant_id: "t-B", role: "admin" },
    ];
  });

  it.each(CALLS)("%s: 選択中テナントで admin なら 403（最初の所属でオーナーでも通さない）", async (_n, call) => {
    const res = await call();
    expect(res.status).toBe(403);
    expect(state.stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(state.stripe.portalCreate).not.toHaveBeenCalled();
  });

  it("checkout / resume: 選択中テナントのオーナーなら、そのテナントの契約として作る", async () => {
    state.memberships[1].role = "owner";
    expect((await checkout(req({ access_token: "tok", plan_tier: "pro" }))).status).toBe(200);
    expect((await resume(req({ access_token: "tok" }))).status).toBe(200);
    const refs = state.stripe.checkoutCreate.mock.calls.map(
      (c) => (c[0] as { client_reference_id: string }).client_reference_id,
    );
    expect(refs).toEqual(["t-B", "t-B"]);
  });

  it("portal: 選択中テナントのオーナーなら、そのテナントの Stripe 顧客で開く", async () => {
    state.memberships[1].role = "owner";
    expect((await portal(req({ access_token: "tok" }))).status).toBe(200);
    expect((state.stripe.portalCreate.mock.calls[0][0] as { customer: string }).customer).toBe("cus_B");
  });

  it("選択中テナントが無ければ最も古い所属（t-A）で判定する", async () => {
    state.activeTenant = undefined;
    expect((await portal(req({ access_token: "tok" }))).status).toBe(200);
    expect((state.stripe.portalCreate.mock.calls[0][0] as { customer: string }).customer).toBe("cus_A");
  });
});
