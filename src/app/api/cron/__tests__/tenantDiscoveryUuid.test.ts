/**
 * opt-in テナントの discovery（tenant_ai_automation_settings を tenant_id でキーセットページング）が、
 * uuid 列に空文字を比べて落ちないこと。本番では `.gt("tenant_id", "")` が 22P02
 * （invalid input syntax for type uuid: ""）を返し、unanswered-alerts が 30 分ごとに 500 になっていた。
 * 同じループを持つ 3 本の cron をまとめて見る。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { fromMock, sendCronFailureAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendCronFailureAlertMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cronAuth", () => ({ verifyCronRequest: () => ({ authorized: true }) }));
vi.mock("@/lib/cronAlert", () => ({ sendCronFailureAlert: sendCronFailureAlertMock }));
vi.mock("@/lib/cron/lock", () => ({
  withCronLock: async (_a: unknown, _t: string, _s: number, fn: () => Promise<unknown>) => ({
    acquired: true,
    value: await fn(),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/ai/automation/policy", () => ({
  loadAiAutomationSettings: vi.fn(),
  tenantEligibleForAiAutomation: vi.fn(),
}));
vi.mock("@/lib/cron/unansweredAlerts", () => ({ processUnansweredThreadAlerts: vi.fn() }));
vi.mock("@/lib/cron/reservationReminders", () => ({ processDayBeforeReminders: vi.fn() }));
vi.mock("@/lib/cron/flowNudges", () => ({ processStalledFlowNudges: vi.fn() }));

/** PostgREST 同様、uuid 列への非 uuid 比較はエラーを返すビルダー */
function settingsTable() {
  let badGt: string | null = null;
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    gt: (_col: string, v: string) => {
      if (!UUID.test(v)) badGt = v;
      return b;
    },
    then: (resolve: (r: unknown) => unknown) =>
      resolve(
        badGt !== null
          ? { data: null, error: { message: `invalid input syntax for type uuid: "${badGt}"` } }
          : { data: [], error: null },
      ),
  };
  return b;
}

const req = () => new Request("http://localhost/api/cron/x") as unknown as NextRequest;

describe.each([
  ["unanswered-alerts", () => import("@/app/api/cron/unanswered-alerts/route")],
  ["reservation-reminders", () => import("@/app/api/cron/reservation-reminders/route")],
  ["flow-nudges", () => import("@/app/api/cron/flow-nudges/route")],
])("%s tenant discovery", (_name, load) => {
  beforeEach(() => {
    fromMock.mockReset().mockImplementation(() => settingsTable());
    sendCronFailureAlertMock.mockClear();
  });

  it("does not compare the uuid tenant_id against a non-uuid on the first page", async () => {
    const { GET } = await load();
    const res = await GET(req());
    expect(sendCronFailureAlertMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
