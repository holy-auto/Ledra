import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  shouldAutoReplyStatus: vi.fn(),
  tenantEligibleForAiAutomation: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
  notifyStaffOfAiAction: vi.fn(),
  resolveCustomerIdByLineUser: vi.fn(),
  sendCustomerLineText: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  todayJst: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("../policy", () => ({
  loadAiAutomationSettings: mocks.loadAiAutomationSettings,
  tenantEligibleForAiAutomation: mocks.tenantEligibleForAiAutomation,
  notifyStaffOfAiAction: mocks.notifyStaffOfAiAction,
}));
vi.mock("../orchestrator", () => ({ shouldAutoReplyStatus: mocks.shouldAutoReplyStatus }));
vi.mock("../conversationFlowPostback", () => ({ resolveCustomerIdByLineUser: mocks.resolveCustomerIdByLineUser }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/gantt/board", () => ({ todayJst: mocks.todayJst }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeReplyWorkStatus } from "../statusReplyAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const TODAY = "2026-08-29";

function baseParams(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    intent: "status_inquiry",
    messageId: "msg-1",
    channel: "line",
    settings: {} as never,
    ...over,
  };
}

function seedReservations(rows: Array<Record<string, unknown>>) {
  mocks.store.tables.reservations = rows.map((r) => ({ tenant_id: TENANT, customer_id: CUSTOMER, ...r }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({ reservations: [] });
  mocks.shouldAutoReplyStatus.mockReturnValue(true);
  mocks.tenantEligibleForAiAutomation.mockResolvedValue(true);
  mocks.resolveCustomerIdByLineUser.mockResolvedValue(CUSTOMER);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.todayJst.mockReturnValue(TODAY);
});

describe("maybeReplyWorkStatus", () => {
  it("does nothing when the opt-in is off", async () => {
    mocks.shouldAutoReplyStatus.mockReturnValue(false);
    expect(await maybeReplyWorkStatus(baseParams())).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing for non-status intents", async () => {
    expect(await maybeReplyWorkStatus(baseParams({ intent: "cancel" }))).toBe(false);
  });

  it("hands off for an unlinked LINE user (cannot identify their reservations)", async () => {
    mocks.resolveCustomerIdByLineUser.mockResolvedValue(null);
    const handled = await maybeReplyWorkStatus(baseParams({ customerId: null }));
    expect(handled).toBe(true);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("担当より");
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
  });

  it("never trusts a passed customerId that isn't the LINE-linked one (no cross-customer disclosure)", async () => {
    // 攻撃者: 未紐付け LINE ユーザーが本文に他人のメールを書き、inboundAuto がそのメールから
    // customerId を解決して渡してきても、LINE 紐付けが無ければ他人の状況を答えない。
    mocks.resolveCustomerIdByLineUser.mockResolvedValue(null);
    seedReservations([
      {
        id: "victim-r",
        status: "in_progress",
        scheduled_date: TODAY,
        start_time: "09:00:00",
        title: "被害者の予約",
        progress_pct: 50,
      },
    ]);
    const handled = await maybeReplyWorkStatus(baseParams({ customerId: "victim-customer-id" }));
    expect(handled).toBe(true);
    // 状況ではなく引き継ぎ文面のみ。被害者の予約内容は一切出さない。
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body as string;
    expect(body).toContain("担当より");
    expect(body).not.toContain("被害者");
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });

  it("hands off when the customer has no (non-cancelled) reservation", async () => {
    seedReservations([
      {
        id: "r-x",
        status: "cancelled",
        scheduled_date: "2026-09-01",
        start_time: null,
        title: "A",
        progress_pct: null,
      },
    ]);
    const handled = await maybeReplyWorkStatus(baseParams());
    expect(handled).toBe(true);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
  });

  it("reports an in-progress job (preferred over an upcoming one) with progress", async () => {
    seedReservations([
      {
        id: "r-future",
        status: "confirmed",
        scheduled_date: "2026-09-10",
        start_time: "10:00:00",
        title: "点検",
        progress_pct: null,
      },
      {
        id: "r-now",
        status: "in_progress",
        scheduled_date: TODAY,
        start_time: "09:00:00",
        title: "コーティング",
        progress_pct: 60,
      },
    ]);
    const handled = await maybeReplyWorkStatus(baseParams());
    expect(handled).toBe(true);
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body as string;
    expect(body).toContain("作業を進めて");
    expect(body).toContain("60%");
    expect(mocks.logAutoActionExecuted.mock.calls[0][0].resource.id).toBe("r-now");
  });

  it("reports the soonest upcoming reservation when nothing is in progress", async () => {
    seedReservations([
      {
        id: "r-late",
        status: "confirmed",
        scheduled_date: "2026-09-20",
        start_time: "10:00:00",
        title: "点検",
        progress_pct: null,
      },
      {
        id: "r-soon",
        status: "confirmed",
        scheduled_date: "2026-09-02",
        start_time: "14:00:00",
        title: "コーティング",
        progress_pct: null,
      },
    ]);
    await maybeReplyWorkStatus(baseParams());
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body as string;
    expect(body).toContain("ご予約を承っております");
    expect(mocks.logAutoActionExecuted.mock.calls[0][0].resource.id).toBe("r-soon");
  });

  it("falls back to the most recent completed reservation", async () => {
    seedReservations([
      {
        id: "r-old",
        status: "completed",
        scheduled_date: "2026-07-01",
        start_time: "10:00:00",
        title: "点検",
        progress_pct: 100,
      },
      {
        id: "r-recent",
        status: "completed",
        scheduled_date: "2026-08-20",
        start_time: "10:00:00",
        title: "コーティング",
        progress_pct: 100,
      },
    ]);
    await maybeReplyWorkStatus(baseParams());
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body as string;
    expect(body).toContain("完了しております");
    expect(mocks.logAutoActionExecuted.mock.calls[0][0].resource.id).toBe("r-recent");
  });
});
