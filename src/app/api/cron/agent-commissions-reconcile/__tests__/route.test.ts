import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  withCronLock: vi.fn(),
  reconcileAgentCommissions: vi.fn(),
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
  createServiceRoleAdmin: vi.fn().mockReturnValue({}),
  getStripeClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/cronAuth", () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock("@/lib/cron/lock", () => ({ withCronLock: mocks.withCronLock }));
vi.mock("@/lib/agents/reconcile", () => ({ reconcileAgentCommissions: mocks.reconcileAgentCommissions }));
vi.mock("@/lib/cronAlert", () => ({ sendCronFailureAlert: mocks.sendCronFailureAlert }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/stripe/client", () => ({ getStripeClient: mocks.getStripeClient }));

import { GET } from "@/app/api/cron/agent-commissions-reconcile/route";
import type { NextRequest } from "next/server";

function req(): NextRequest {
  return new Request("http://localhost/api/cron/agent-commissions-reconcile") as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/cron/agent-commissions-reconcile", () => {
  it("rejects unauthorized requests", async () => {
    mocks.verifyCronRequest.mockReturnValue({ authorized: false, error: "bad token" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.reconcileAgentCommissions).not.toHaveBeenCalled();
  });

  it("runs reconciliation and returns the summary when the lock is acquired", async () => {
    mocks.verifyCronRequest.mockReturnValue({ authorized: true });
    const summary = { referrals: 3, scanned: 4, created: 2, skipped: 2, errors: 0 };
    mocks.reconcileAgentCommissions.mockResolvedValue(summary);
    mocks.withCronLock.mockImplementation(
      async (_s: unknown, _t: unknown, _ttl: unknown, fn: () => Promise<unknown>) => ({
        acquired: true,
        value: await fn(),
      }),
    );

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ...summary });
    expect(mocks.reconcileAgentCommissions).toHaveBeenCalledTimes(1);
  });

  it("skips when another worker holds the lock", async () => {
    mocks.verifyCronRequest.mockReturnValue({ authorized: true });
    mocks.withCronLock.mockResolvedValue({ acquired: false });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, skipped: "lock-held" });
    expect(mocks.reconcileAgentCommissions).not.toHaveBeenCalled();
  });

  it("alerts and returns 500 when reconciliation throws", async () => {
    mocks.verifyCronRequest.mockReturnValue({ authorized: true });
    mocks.withCronLock.mockImplementation(
      async (_s: unknown, _t: unknown, _ttl: unknown, fn: () => Promise<unknown>) => {
        await fn();
        return { acquired: true, value: {} };
      },
    );
    mocks.reconcileAgentCommissions.mockRejectedValue(new Error("stripe down"));

    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(mocks.sendCronFailureAlert).toHaveBeenCalledWith("agent-commissions-reconcile", expect.any(Error));
  });
});
