/**
 * Tests for /api/cron/stripe-event-monitor.
 *
 * Contract:
 *   - 401 when verifyCronRequest rejects
 *   - skipped when withCronLock cannot acquire
 *   - 0 stuck rows → ok with stuck=0, alerted=false, no fetch
 *   - >0 stuck rows → alert email is sent, response reports counts
 *   - DB query failure → cron failure alert fires + 500
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  verifyCronRequestMock,
  sendCronFailureAlertMock,
  withCronLockMock,
  selectChainResultRef,
  fetchMock,
  captureMessageMock,
  withScopeMock,
} = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  sendCronFailureAlertMock: vi.fn().mockResolvedValue(undefined),
  withCronLockMock: vi.fn(),
  selectChainResultRef: {
    current: { data: [] as Array<Record<string, unknown>>, error: null as { message: string } | null },
  },
  fetchMock: vi.fn(),
  captureMessageMock: vi.fn(),
  withScopeMock: vi.fn((cb: (scope: { setTag: () => void; setLevel: () => void; setExtra: () => void }) => void) =>
    cb({ setTag: vi.fn(), setLevel: vi.fn(), setExtra: vi.fn() }),
  ),
}));

vi.mock("@/lib/cronAuth", () => ({
  verifyCronRequest: (...args: unknown[]) => verifyCronRequestMock(...args),
}));

vi.mock("@/lib/cronAlert", () => ({
  sendCronFailureAlert: (...args: unknown[]) => sendCronFailureAlertMock(...args),
}));

vi.mock("@/lib/cron/lock", () => ({
  withCronLock: (...args: unknown[]) => withCronLockMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (_table: string) => {
      const result = selectChainResultRef.current;
      return {
        select: () => ({
          is: () => ({
            lt: () => ({
              order: () => ({
                limit: () => Promise.resolve(result),
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: captureMessageMock,
  withScope: withScopeMock,
}));

import { GET } from "@/app/api/cron/stripe-event-monitor/route";
import { NextRequest } from "next/server";

function req(): NextRequest {
  return new Request("http://localhost/api/cron/stripe-event-monitor", {
    headers: { authorization: "Bearer test" },
  }) as unknown as NextRequest;
}

describe("GET /api/cron/stripe-event-monitor", () => {
  const ORIG_FETCH = globalThis.fetch;

  beforeEach(() => {
    verifyCronRequestMock.mockReset().mockReturnValue({ authorized: true });
    sendCronFailureAlertMock.mockClear();
    withCronLockMock.mockReset().mockImplementation(async (_a, _name, _ttl, fn) => ({
      acquired: true,
      value: await fn(),
    }));
    selectChainResultRef.current = { data: [], error: null };
    fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
    captureMessageMock.mockReset();
    withScopeMock.mockClear();

    process.env.RESEND_API_KEY = "test-resend";
    process.env.RESEND_FROM = "noreply@example.com";
    process.env.CONTACT_TO_EMAIL = "ops@example.com";
  });

  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
  });

  it("returns 401 when verifyCronRequest rejects", async () => {
    verifyCronRequestMock.mockReturnValueOnce({ authorized: false, error: "bad sig" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(withCronLockMock).not.toHaveBeenCalled();
  });

  it("returns 200 with skipped=lock_held when cron lock can't be acquired", async () => {
    withCronLockMock.mockResolvedValueOnce({ acquired: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped: string };
    expect(body.skipped).toBe("lock_held");
  });

  it("returns 200 stuck=0 alerted=false when no stuck events found", async () => {
    selectChainResultRef.current = { data: [], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stuck: number; alerted: boolean };
    expect(body.stuck).toBe(0);
    expect(body.alerted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an alert email when stuck events are found, including event_id and error_message in body", async () => {
    selectChainResultRef.current = {
      data: [
        {
          event_id: "evt_stuck_1",
          event_type: "customer.subscription.updated",
          created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
          error_message: "syncBySubscription failed: PG error 42P01",
          attempts: 0,
        },
        {
          event_id: "evt_stuck_2",
          event_type: "invoice.paid",
          created_at: new Date(Date.now() - 7 * 60_000).toISOString(),
          error_message: null,
          attempts: 2,
        },
      ],
      error: null,
    };

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stuck: number; alerted: boolean };
    expect(body.stuck).toBe(2);
    expect(body.alerted).toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as { body: string }).body) as { subject: string; text: string };
    expect(payload.subject).toContain("Stripe webhook events stuck");
    expect(payload.text).toContain("evt_stuck_1");
    expect(payload.text).toContain("evt_stuck_2");
    expect(payload.text).toContain("syncBySubscription failed");

    await vi.waitFor(() => expect(captureMessageMock).toHaveBeenCalledOnce());
    expect(captureMessageMock).toHaveBeenCalledWith(expect.stringContaining("2 stuck webhook event"), "error");
  });

  it("falls through to SendGrid (no fetch, since unconfigured in test) when RESEND_API_KEY is unset — does not skip alerting outright", async () => {
    delete process.env.RESEND_API_KEY;
    selectChainResultRef.current = {
      data: [
        {
          event_id: "evt_stuck_1",
          event_type: "x",
          created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
          error_message: null,
          attempts: 0,
        },
      ],
      error: null,
    };

    const res = await GET(req());
    expect(res.status).toBe(200);
    // Neither Resend (no key) nor SendGrid (not configured in test env) can
    // actually reach the network, so fetch is never called — but this is
    // sendEmail()'s internal fallback deciding that, not an early bail-out
    // in this route (see the Sentry assertion below for the part that must
    // never depend on email config).
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(captureMessageMock).toHaveBeenCalledOnce());
  });

  it("still reports to Sentry when CONTACT_TO_EMAIL is unset, and skips the email attempt entirely", async () => {
    delete process.env.CONTACT_TO_EMAIL;
    selectChainResultRef.current = {
      data: [
        {
          event_id: "evt_stuck_1",
          event_type: "x",
          created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
          error_message: null,
          attempts: 0,
        },
      ],
      error: null,
    };

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stuck: number; alerted: boolean };
    expect(body.stuck).toBe(1);
    expect(body.alerted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(captureMessageMock).toHaveBeenCalledOnce());
    expect(captureMessageMock).toHaveBeenCalledWith(expect.stringContaining("1 stuck webhook event"), "error");
  });

  it("emits cron failure alert + 500 when the underlying query throws", async () => {
    selectChainResultRef.current = { data: [], error: { message: "table missing" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(sendCronFailureAlertMock).toHaveBeenCalledWith(
      "stripe-event-monitor",
      expect.stringContaining("failed to query stuck events"),
    );
  });
});
