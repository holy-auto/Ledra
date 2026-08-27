import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  shouldAutoSelfCancel: vi.fn(),
  tenantEligibleForAiAutomation: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
  notifyStaffOfAiAction: vi.fn(),
  resolveCustomerIdByLineUser: vi.fn(),
  sendCustomerLineText: vi.fn(),
  sendCustomerLineButtons: vi.fn(),
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
vi.mock("../orchestrator", () => ({ shouldAutoSelfCancel: mocks.shouldAutoSelfCancel }));
vi.mock("../conversationFlowPostback", () => ({
  resolveCustomerIdByLineUser: mocks.resolveCustomerIdByLineUser,
  CANCEL_CANDIDATES_KEY: "cancel_candidates",
}));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: mocks.sendCustomerLineText,
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
}));
vi.mock("@/lib/gantt/board", () => ({ todayJst: mocks.todayJst }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeStartCancelFlow } from "../cancelFlowAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const TODAY = "2026-08-26";

function baseParams(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    intent: "cancel",
    messageId: "msg-1",
    channel: "line",
    settings: {} as never,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({ reservations: [], line_conversation_flows: [] });
  mocks.shouldAutoSelfCancel.mockReturnValue(true);
  mocks.tenantEligibleForAiAutomation.mockResolvedValue(true);
  mocks.resolveCustomerIdByLineUser.mockResolvedValue(CUSTOMER);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
  mocks.todayJst.mockReturnValue(TODAY);
});

function seedReservations(rows: Array<Record<string, unknown>>) {
  mocks.store.tables.reservations = rows.map((r) => ({
    tenant_id: TENANT,
    customer_id: CUSTOMER,
    status: "confirmed",
    ...r,
  }));
}

describe("maybeStartCancelFlow", () => {
  it("does nothing when the self-cancel opt-in is off", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(false);
    expect(await maybeStartCancelFlow(baseParams())).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });

  it("does nothing for non-cancel intents", async () => {
    expect(await maybeStartCancelFlow(baseParams({ intent: "new_reservation" }))).toBe(false);
  });

  it("hands off to staff for an unlinked LINE user (cannot identify their reservations)", async () => {
    mocks.resolveCustomerIdByLineUser.mockResolvedValue(null);
    const handled = await maybeStartCancelFlow(baseParams({ customerId: null }));
    expect(handled).toBe(true);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("hands off to staff when no reservation is eligible (only same-day / past)", async () => {
    // 当日 (=today) と過去は「前日まで」の対象外 → セルフ不可でスタッフへ。
    seedReservations([
      { id: "r-today", scheduled_date: TODAY, start_time: "10:00:00", title: "コーティング" },
      { id: "r-past", scheduled_date: "2026-08-01", start_time: "10:00:00", title: "点検" },
    ]);
    const handled = await maybeStartCancelFlow(baseParams());
    expect(handled).toBe(true);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("goes straight to confirm for a single eligible (future) reservation", async () => {
    seedReservations([{ id: "r-future", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" }]);
    const handled = await maybeStartCancelFlow(baseParams());
    expect(handled).toBe(true);
    const flow = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flow?.payload.state).toBe("awaiting_cancel_confirm");
    expect(flow?.payload.reservation_id).toBe("r-future");
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
  });

  it("presents a pick list when multiple reservations are eligible", async () => {
    seedReservations([
      { id: "r1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" },
      { id: "r2", scheduled_date: "2026-09-05", start_time: "14:00:00", title: "点検" },
    ]);
    const handled = await maybeStartCancelFlow(baseParams());
    expect(handled).toBe(true);
    const flow = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flow?.payload.state).toBe("awaiting_cancel_pick");
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
  });

  it("drops the created flow to expired when the prompt fails to deliver (no dangling flow)", async () => {
    seedReservations([{ id: "r-future", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" }]);
    mocks.sendCustomerLineButtons.mockResolvedValue(false);
    const handled = await maybeStartCancelFlow(baseParams());
    expect(handled).toBe(false);
    // 作った awaiting_cancel_* 行を expired に落とし、72h 塞ぎを防ぐ。
    const expired = mocks.store.updates.find(
      (u) => u.table === "line_conversation_flows" && u.payload.state === "expired",
    );
    expect(expired).toBeTruthy();
  });

  it("does not start a second flow when one is already active", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-x",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_detail",
        context_json: {},
      },
    ];
    seedReservations([{ id: "r-future", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" }]);
    expect(await maybeStartCancelFlow(baseParams())).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });
});
