/**
 * Tests for /api/cron/insurer-sla-alerts.
 *
 * カバレッジ:
 *   - classifySlaStage / shouldNotify の純粋ロジック
 *   - 401 on cron-auth failure
 *   - 200 + skipped when the cron lock is held
 *   - happy path: 案件ゼロ件のとき通知ゼロで 200 を返す
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  verifyCronRequestMock,
  sendCronFailureAlertMock,
  withCronLockMock,
  recordCronSuccessMock,
  recordCronFailureMock,
  fromMock,
} = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  sendCronFailureAlertMock: vi.fn().mockResolvedValue(undefined),
  withCronLockMock: vi.fn(),
  recordCronSuccessMock: vi.fn().mockResolvedValue(undefined),
  recordCronFailureMock: vi.fn().mockResolvedValue(undefined),
  fromMock: vi.fn(),
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
vi.mock("@/lib/cron/failureTracker", () => ({
  recordCronSuccess: (...args: unknown[]) => recordCronSuccessMock(...args),
  recordCronFailure: (...args: unknown[]) => recordCronFailureMock(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({ from: fromMock }),
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

import { GET, __testing } from "@/app/api/cron/insurer-sla-alerts/route";
import { NextRequest } from "next/server";

function req(): NextRequest {
  return new Request("http://localhost/api/cron/insurer-sla-alerts", {
    headers: { authorization: "Bearer test" },
  }) as unknown as NextRequest;
}

describe("classifySlaStage", () => {
  const config = { urgent: 4, high: 24, normal: 72, low: 168 };
  const now = Date.parse("2026-07-02T12:00:00Z");

  it("returns overdue when elapsed exceeds the threshold", () => {
    // urgent = 4h; created 5h ago → overdue
    const created = now - 5 * 3600_000;
    const r = __testing.classifySlaStage(created, "urgent", config, now);
    expect(r.stage).toBe("overdue");
    expect(r.remainingHours).toBeLessThanOrEqual(0);
  });

  it("returns at_risk when within 25% of the deadline", () => {
    // normal = 72h; created 60h ago → remaining 12h <= 18h (25%) → at_risk
    const created = now - 60 * 3600_000;
    const r = __testing.classifySlaStage(created, "normal", config, now);
    expect(r.stage).toBe("at_risk");
  });

  it("returns null when comfortably within SLA", () => {
    const created = now - 1 * 3600_000;
    const r = __testing.classifySlaStage(created, "normal", config, now);
    expect(r.stage).toBeNull();
  });

  it("falls back to the normal threshold for an unknown priority", () => {
    const created = now - 100 * 3600_000;
    const r = __testing.classifySlaStage(created, "weird", config, now);
    expect(r.thresholdHours).toBe(config.normal);
    expect(r.stage).toBe("overdue");
  });
});

describe("shouldNotify (dedup / escalation)", () => {
  it("notifies fresh at_risk / overdue", () => {
    expect(__testing.shouldNotify("at_risk", null)).toBe(true);
    expect(__testing.shouldNotify("overdue", null)).toBe(true);
  });
  it("allows escalation at_risk → overdue", () => {
    expect(__testing.shouldNotify("overdue", "at_risk")).toBe(true);
  });
  it("suppresses repeats of the same stage", () => {
    expect(__testing.shouldNotify("at_risk", "at_risk")).toBe(false);
    expect(__testing.shouldNotify("overdue", "overdue")).toBe(false);
  });
  it("does not regress overdue → at_risk", () => {
    expect(__testing.shouldNotify("at_risk", "overdue")).toBe(false);
  });
});

describe("GET /api/cron/insurer-sla-alerts", () => {
  beforeEach(() => {
    verifyCronRequestMock.mockReset().mockReturnValue({ authorized: true });
    sendCronFailureAlertMock.mockClear();
    recordCronSuccessMock.mockClear();
    recordCronFailureMock.mockClear();
    withCronLockMock.mockReset();
    fromMock.mockReset();
  });

  it("401 when cron auth fails", async () => {
    verifyCronRequestMock.mockReturnValueOnce({ authorized: false, error: "bad sig" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(withCronLockMock).not.toHaveBeenCalled();
  });

  it("200 skipped when the cron lock is held", async () => {
    withCronLockMock.mockResolvedValueOnce({ acquired: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped: string };
    expect(body.skipped).toBe("lock-held");
  });

  it("happy path: zero open cases → zero notifications", async () => {
    // insurer_cases select().in().order() resolves to an empty list.
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer_cases") {
        const chain = {
          select: () => chain,
          in: () => chain,
          order: () => Promise.resolve({ data: [], error: null }),
        };
        return chain;
      }
      throw new Error(`unexpected table query: ${table}`);
    });

    withCronLockMock.mockImplementation(async (_a, _name, _ttl, fn) => ({
      acquired: true,
      value: await fn(),
    }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cases_scanned: number;
      at_risk_notified: number;
      overdue_notified: number;
      notifications_inserted: number;
    };
    expect(body.cases_scanned).toBe(0);
    expect(body.at_risk_notified).toBe(0);
    expect(body.overdue_notified).toBe(0);
    expect(body.notifications_inserted).toBe(0);
    expect(recordCronSuccessMock).toHaveBeenCalledWith(expect.anything(), "insurer-sla-alerts");
  });
});
