import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldRunConversationFlow: vi.fn(),
  shouldAutoSendDocumentOnConfirm: vi.fn(),
  sendCustomerLineText: vi.fn(),
  sendCustomerLineButtons: vi.fn(),
  recordInboundLineMessage: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  syncCreateEvent: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("@/lib/billing/planFeatures", () => ({
  canUseFeature: () => true,
  normalizePlanTier: (t: string) => t,
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({
  shouldRunConversationFlow: mocks.shouldRunConversationFlow,
  shouldAutoSendDocumentOnConfirm: mocks.shouldAutoSendDocumentOnConfirm,
}));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: mocks.sendCustomerLineText,
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
}));
vi.mock("@/lib/line/messageStore", () => ({ recordInboundLineMessage: mocks.recordInboundLineMessage }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/gcal/client", () => ({ syncCreateEvent: mocks.syncCreateEvent }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeAdvanceFlowOnQuoteSent, handleFlowPostback } from "../conversationFlowPostback";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const DOC = "33333333-3333-4333-a333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true }],
    line_conversation_flows: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.shouldRunConversationFlow.mockReturnValue(true);
  mocks.shouldAutoSendDocumentOnConfirm.mockReturnValue(true);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
  mocks.recordInboundLineMessage.mockResolvedValue({ ok: true });
  mocks.syncCreateEvent.mockResolvedValue("gcal-event-1");
});

/** 全曜日どこかにヒットするよう全曜日ぶん緩い受付枠を seed する (今日から14日以内に必ず候補が出る)。 */
function seedOpenSlots(store: FakeStore) {
  store.tables.external_booking_slots = Array.from({ length: 7 }, (_, dow) => ({
    tenant_id: TENANT,
    day_of_week: dow,
    start_time: "09:00:00",
    end_time: "18:00:00",
    max_bookings: 5,
    accepted_categories: null,
    is_active: true,
  }));
  store.tables.closed_days = [];
  store.tables.reservations = [];
}

describe("maybeAdvanceFlowOnQuoteSent", () => {
  function seedQuoteDrafted() {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "quote_drafted",
        quote_doc_id: DOC,
        context_json: {},
      },
    ];
  }

  it("advances quote_drafted → awaiting_quote_ok and sends OK/NG buttons", async () => {
    seedQuoteDrafted();
    await maybeAdvanceFlowOnQuoteSent({ tenantId: TENANT, documentId: DOC });

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "awaiting_quote_ok" });
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    const arg = mocks.sendCustomerLineButtons.mock.calls[0][0];
    expect(arg.buttons.map((b: { data: string }) => b.data)).toEqual(["flow:yes", "flow:no"]);
  });

  it("does nothing when opt-in is off", async () => {
    seedQuoteDrafted();
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    await maybeAdvanceFlowOnQuoteSent({ tenantId: TENANT, documentId: DOC });
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });

  it("does nothing for a document with no linked flow", async () => {
    await maybeAdvanceFlowOnQuoteSent({ tenantId: TENANT, documentId: DOC });
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });

  it("does not ask approval when quotes are not auto-sent on confirm (customer hasn't received it)", async () => {
    seedQuoteDrafted();
    mocks.shouldAutoSendDocumentOnConfirm.mockReturnValue(false);
    await maybeAdvanceFlowOnQuoteSent({ tenantId: TENANT, documentId: DOC });
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
  });
});

describe("handleFlowPostback", () => {
  function seedAwaitingOk() {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_ok",
        context_json: {},
      },
    ];
  }

  it("on OK with no available slots: hands off to staff for scheduling and acks the customer", async () => {
    seedAwaitingOk();
    // external_booking_slots が空 (未 seed) なので候補ゼロ件 → 従来どおりスタッフ引き継ぎ。
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(true);

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "human_takeover" });
    expect(upd?.payload.context_json).toMatchObject({ quote_decision: "ok" });
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("日程");
    // スタッフ通知が入る。
    expect(mocks.store.inserts.some((i) => i.table === "notifications")).toBe(true);
    // 顧客の選択がスレッドに記録される。
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("はい") }),
    );
  });

  it("on OK with available slots: presents schedule candidates as buttons", async () => {
    seedAwaitingOk();
    seedOpenSlots(mocks.store);

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(true);

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "awaiting_schedule_pick" });
    const candidates = upd?.payload.context_json.schedule_candidates as Array<{ date: string; start_time: string }>;
    expect(candidates.length).toBeGreaterThan(0);

    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    const btnArg = mocks.sendCustomerLineButtons.mock.calls[0][0];
    expect(btnArg.buttons[0].data).toBe("flow:slot:0");
    expect(btnArg.buttons[btnArg.buttons.length - 1].data).toBe("flow:cancel");
  });

  it("on NG (相談する): switches to human takeover with a consult message", async () => {
    seedAwaitingOk();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:no" });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.context_json).toMatchObject({ quote_decision: "consult" });
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("相談");
  });

  it("returns false when there is no active flow (falls back to inbox logging)", async () => {
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(false);
  });

  it("returns false for a postback that does not apply to the current state", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_detail",
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing when opt-in is off", async () => {
    seedAwaitingOk();
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(false);
  });
});

describe("handleFlowPostback — slot selection (Phase 1b-3)", () => {
  function todayYmd(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  // seedOpenSlots は全曜日 09:00-18:00 を空けるため、今日が常に 1 件目の候補になる。
  const CANDIDATE = { date: todayYmd(), start_time: "09:00", end_time: "18:00" };

  function seedAwaitingSchedulePick(candidates: Array<Record<string, unknown>> = [CANDIDATE]) {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_schedule_pick",
        quote_doc_id: DOC,
        context_json: { schedule_candidates: candidates },
      },
    ];
  }

  it("creates a reservation, syncs gcal, and closes the flow", async () => {
    seedOpenSlots(mocks.store);
    seedAwaitingSchedulePick();
    mocks.store.tables.documents = [{ id: DOC, total: 33000 }];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(true);

    const inserted = mocks.store.inserts.find((i) => i.table === "reservations");
    expect(inserted?.payload).toMatchObject({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      scheduled_date: CANDIDATE.date,
      start_time: CANDIDATE.start_time,
      end_time: CANDIDATE.end_time,
      status: "confirmed",
      estimated_amount: 33000,
    });
    expect(mocks.syncCreateEvent).toHaveBeenCalledTimes(1);

    // 選択の排他確保 (awaiting_schedule_pick → scheduled) → 確定 (→ closed) の2回更新される。
    const flowUpdates = mocks.store.updates.filter((u) => u.table === "line_conversation_flows");
    expect(flowUpdates.map((u) => u.payload.state)).toEqual(["scheduled", "closed"]);
    const upd = flowUpdates[flowUpdates.length - 1];
    expect(upd?.payload.reservation_id).toBe(inserted?.payload.id);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("確定");
  });

  it("hands off to staff when the chosen slot got taken (re-validation fails)", async () => {
    // 再検証用の空き枠を seed しない → 空き無し扱いで埋まったとみなす。
    seedAwaitingSchedulePick();

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(true);

    expect(mocks.store.inserts.some((i) => i.table === "reservations")).toBe(false);
    const flowUpdates = mocks.store.updates.filter((u) => u.table === "line_conversation_flows");
    expect(flowUpdates.map((u) => u.payload.state)).toEqual(["scheduled", "human_takeover"]);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("埋まって");
  });

  it("ignores a redelivered slot-select postback once the flow has already moved past awaiting_schedule_pick", async () => {
    // LINE の at-least-once 配信で同じ postback が再送された場合を模す。1回目の処理で
    // flow は既に scheduled まで進んでいるため、outer の state ガードで素通しされる。
    seedOpenSlots(mocks.store);
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "scheduled",
        quote_doc_id: DOC,
        context_json: { schedule_candidates: [CANDIDATE] },
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(false);
    expect(mocks.store.inserts.some((i) => i.table === "reservations")).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("hands off to staff when the customer taps 'その他の日程を相談する' (flow:cancel)", async () => {
    seedAwaitingSchedulePick();

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel" });
    expect(handled).toBe(true);

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "human_takeover" });
    expect(upd?.payload.context_json).toMatchObject({ schedule_decision: "consult" });
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.store.inserts.some((i) => i.table === "notifications")).toBe(true);
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("その他の日程") }),
    );
  });

  it("returns false for an out-of-range slot index", async () => {
    seedOpenSlots(mocks.store);
    seedAwaitingSchedulePick([]);

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(false);
    expect(mocks.store.inserts.some((i) => i.table === "reservations")).toBe(false);
  });
});
