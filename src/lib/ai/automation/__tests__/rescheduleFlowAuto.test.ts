import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  shouldAutoSelfReschedule: vi.fn(),
  tenantEligibleForAiAutomation: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
  notifyStaffOfAiAction: vi.fn(),
  resolveCustomerIdByLineUser: vi.fn(),
  sendCustomerLineText: vi.fn(),
  sendCustomerLineButtons: vi.fn(),
  fetchFlowScheduleCandidates: vi.fn(),
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
vi.mock("../orchestrator", () => ({ shouldAutoSelfReschedule: mocks.shouldAutoSelfReschedule }));
vi.mock("../conversationFlowPostback", () => ({
  resolveCustomerIdByLineUser: mocks.resolveCustomerIdByLineUser,
  RESCHEDULE_CANDIDATES_KEY: "reschedule_candidates",
  RESCHEDULE_TARGET_KEY: "reschedule_target",
  SCHEDULE_CANDIDATES_KEY: "schedule_candidates",
}));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: mocks.sendCustomerLineText,
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
}));
vi.mock("@/lib/line/flow/scheduleCandidates", async (importActual) => {
  // fetchFlowScheduleCandidates だけ差し替え、reservationDurationMinutes は本物を使う
  // (duration→estimatedMinutes の配線を本番実装に対して検証するため)。
  const actual = await importActual<typeof import("@/lib/line/flow/scheduleCandidates")>();
  return { ...actual, fetchFlowScheduleCandidates: mocks.fetchFlowScheduleCandidates };
});
vi.mock("@/lib/gantt/board", () => ({ todayJst: mocks.todayJst }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeStartRescheduleFlow } from "../rescheduleFlowAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const TODAY = "2026-08-26";
const SLOTS = [{ date: "2026-09-10", start_time: "10:00:00", end_time: "11:00:00" }];

function baseParams(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    intent: "change_reservation",
    messageId: "msg-1",
    channel: "line",
    settings: {} as never,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({ reservations: [], line_conversation_flows: [] });
  mocks.shouldAutoSelfReschedule.mockReturnValue(true);
  mocks.tenantEligibleForAiAutomation.mockResolvedValue(true);
  mocks.resolveCustomerIdByLineUser.mockResolvedValue(CUSTOMER);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
  mocks.fetchFlowScheduleCandidates.mockResolvedValue(SLOTS);
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

describe("maybeStartRescheduleFlow", () => {
  it("does nothing when the self-reschedule opt-in is off", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(false);
    expect(await maybeStartRescheduleFlow(baseParams())).toBe(false);
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });

  it("does nothing for non-change intents", async () => {
    expect(await maybeStartRescheduleFlow(baseParams({ intent: "cancel" }))).toBe(false);
  });

  it("hands off to staff for an unlinked LINE user", async () => {
    mocks.resolveCustomerIdByLineUser.mockResolvedValue(null);
    const handled = await maybeStartRescheduleFlow(baseParams({ customerId: null }));
    expect(handled).toBe(true);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("hands off when no reservation is eligible (only same-day / past)", async () => {
    seedReservations([
      { id: "r-today", scheduled_date: TODAY, start_time: "10:00:00", title: "コーティング" },
      { id: "r-past", scheduled_date: "2026-08-01", start_time: "10:00:00", title: "点検" },
    ]);
    const handled = await maybeStartRescheduleFlow(baseParams());
    expect(handled).toBe(true);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("goes straight to slot selection for a single eligible reservation", async () => {
    seedReservations([
      {
        id: "r-future",
        scheduled_date: "2026-09-01",
        start_time: "10:00:00",
        end_time: "12:00:00",
        title: "コーティング",
        loaner_car_id: "loaner-1",
      },
    ]);
    const handled = await maybeStartRescheduleFlow(baseParams());
    expect(handled).toBe(true);
    const flow = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flow?.payload.state).toBe("awaiting_reschedule_slot");
    expect(flow?.payload.reservation_id).toBe("r-future");
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    // 変更先候補は「前日まで」= 当日 (TODAY) を含めず翌日起点で取得し、動かす対象の予約は
    // 空き計算から除外する。さらに元予約の実所要時間 (10:00→12:00=120分)・代車要否
    // (loaner_car_id あり)・カテゴリ不明時の制限枠除外を渡して候補精度を上げる。
    expect(mocks.fetchFlowScheduleCandidates).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({
        fromDate: "2026-08-27",
        excludeReservationId: "r-future",
        estimatedMinutes: 120,
        needsLoaner: true,
        excludeRestricted: true,
      }),
    );
  });

  it("hands off when a single eligible reservation has no available new slots", async () => {
    seedReservations([{ id: "r-future", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" }]);
    mocks.fetchFlowScheduleCandidates.mockResolvedValue([]);
    const handled = await maybeStartRescheduleFlow(baseParams());
    expect(handled).toBe(true);
    expect(mocks.notifyStaffOfAiAction).toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("presents a pick list when multiple reservations are eligible", async () => {
    seedReservations([
      { id: "r1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "A" },
      { id: "r2", scheduled_date: "2026-09-05", start_time: "14:00:00", title: "B" },
    ]);
    const handled = await maybeStartRescheduleFlow(baseParams());
    expect(handled).toBe(true);
    const flow = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flow?.payload.state).toBe("awaiting_reschedule_pick");
    // 複数選択の段階ではまだ日程候補は取りに行かない。
    expect(mocks.fetchFlowScheduleCandidates).not.toHaveBeenCalled();
  });

  it("drops the created flow to expired when the slot prompt fails to deliver", async () => {
    seedReservations([{ id: "r-future", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" }]);
    mocks.sendCustomerLineButtons.mockResolvedValue(false);
    const handled = await maybeStartRescheduleFlow(baseParams());
    expect(handled).toBe(false);
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
    expect(await maybeStartRescheduleFlow(baseParams())).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });
});
