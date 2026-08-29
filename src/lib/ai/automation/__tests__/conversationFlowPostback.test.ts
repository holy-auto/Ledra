import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldRunConversationFlow: vi.fn(),
  shouldAutoSendDocumentOnConfirm: vi.fn(),
  shouldAutoSelfCancel: vi.fn(),
  shouldAutoSelfReschedule: vi.fn(),
  cancelReservationById: vi.fn(),
  rescheduleReservationById: vi.fn(),
  maybeStartCancelFlow: vi.fn(),
  maybeStartRescheduleFlow: vi.fn(),
  todayJst: vi.fn(),
  sendCustomerLineText: vi.fn(),
  sendCustomerLineButtons: vi.fn(),
  recordInboundLineMessage: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  syncCreateEvent: vi.fn(),
  maybeAutoCategorizeReservationOnIntake: vi.fn(),
  maybeAutoProposeWorkflowForReservation: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("@/lib/billing/planFeatures", () => ({
  canUseFeature: () => true,
  normalizePlanTier: (t: string) => t,
}));
vi.mock("../policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: mocks.loadAiAutomationSettings };
});
vi.mock("../orchestrator", () => ({
  shouldRunConversationFlow: mocks.shouldRunConversationFlow,
  shouldAutoSendDocumentOnConfirm: mocks.shouldAutoSendDocumentOnConfirm,
  shouldAutoSelfCancel: mocks.shouldAutoSelfCancel,
  shouldAutoSelfReschedule: mocks.shouldAutoSelfReschedule,
}));
vi.mock("@/lib/reservations/mutate", () => ({
  cancelReservationById: mocks.cancelReservationById,
  rescheduleReservationById: mocks.rescheduleReservationById,
}));
vi.mock("../cancelFlowAuto", () => ({ maybeStartCancelFlow: mocks.maybeStartCancelFlow }));
vi.mock("../rescheduleFlowAuto", () => ({ maybeStartRescheduleFlow: mocks.maybeStartRescheduleFlow }));
vi.mock("@/lib/gantt/board", () => ({ todayJst: mocks.todayJst }));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: mocks.sendCustomerLineText,
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
}));
vi.mock("@/lib/line/messageStore", () => ({ recordInboundLineMessage: mocks.recordInboundLineMessage }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/gcal/client", () => ({ syncCreateEvent: mocks.syncCreateEvent }));
vi.mock("../accountingAuto", () => ({
  maybeAutoCategorizeReservationOnIntake: mocks.maybeAutoCategorizeReservationOnIntake,
}));
vi.mock("../workflowAuto", () => ({
  maybeAutoProposeWorkflowForReservation: mocks.maybeAutoProposeWorkflowForReservation,
}));
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
  mocks.shouldAutoSelfCancel.mockReturnValue(false);
  mocks.shouldAutoSelfReschedule.mockReturnValue(false);
  mocks.cancelReservationById.mockResolvedValue({ ok: true, alreadyFinal: false });
  mocks.rescheduleReservationById.mockResolvedValue({ ok: true });
  mocks.maybeStartCancelFlow.mockResolvedValue(true);
  mocks.maybeStartRescheduleFlow.mockResolvedValue(true);
  mocks.todayJst.mockReturnValue("2026-08-26");
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
  mocks.recordInboundLineMessage.mockResolvedValue({ ok: true });
  mocks.syncCreateEvent.mockResolvedValue("gcal-event-1");
});

/** テナントに登録メニューを seed し、おすすめオプション候補が出るようにする。 */
function seedMenuItems(store: FakeStore) {
  store.tables.menu_items = [
    {
      tenant_id: TENANT,
      id: "menu-1",
      name: "ホイールコーティング",
      unit_price: 8000,
      category_large: "コーティング",
      is_active: true,
      sort_order: 0,
    },
  ];
  store.tables.invoices = [];
}

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

  it("re-send after an option was added: advances to awaiting_final_ok with final-approval buttons (Phase 2)", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "quote_drafted",
        quote_doc_id: DOC,
        context_json: { selected_options: [{ name: "ホイールコーティング", price: 8000, menuItemId: "menu-1" }] },
      },
    ];
    await maybeAdvanceFlowOnQuoteSent({ tenantId: TENANT, documentId: DOC });

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "awaiting_final_ok" });
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineButtons.mock.calls[0][0].text).toContain("オプションを反映");
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

  it("on OK with addon options available: presents option buttons instead of schedule candidates", async () => {
    seedAwaitingOk();
    seedMenuItems(mocks.store);

    // quote_doc_id 未設定 (seedAwaitingOk はセットしない) でも安全に動くことも兼ねて確認する。
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(true);

    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload).toMatchObject({ state: "awaiting_option_confirm" });
    const options = upd?.payload.context_json.option_candidates as Array<{ name: string }>;
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].name).toBe("ホイールコーティング");

    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    const btnArg = mocks.sendCustomerLineButtons.mock.calls[0][0];
    expect(btnArg.buttons[0].data).toBe("flow:option:0");
    expect(btnArg.buttons[btnArg.buttons.length - 1].data).toBe("flow:options_none");
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

describe("handleFlowPostback — option selection (Phase 2)", () => {
  const OPTION = {
    menuItemId: "menu-1",
    name: "ホイールコーティング",
    price: 8000,
    reason: "登録メニューからのおすすめ",
  };

  function seedAwaitingOptionConfirm(options: Array<Record<string, unknown>> = [OPTION]) {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_option_confirm",
        quote_doc_id: DOC,
        context_json: { option_candidates: options },
      },
    ];
  }

  it("option_selected: appends the option to the quote and returns it to draft for re-send", async () => {
    seedAwaitingOptionConfirm();
    mocks.store.tables.documents = [
      {
        id: DOC,
        items_json: [{ item_type: "item", description: "コーティング", quantity: 1, unit_price: 50000, amount: 50000 }],
        tax_rate: 10,
        status: "sent",
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:option:0" });
    expect(handled).toBe(true);

    const docUpdate = mocks.store.updates.find((u) => u.table === "documents");
    expect(docUpdate?.payload).toMatchObject({ status: "draft", subtotal: 58000, tax: 5800, total: 63800 });
    expect(docUpdate?.payload.items_json).toHaveLength(2);

    const flowUpdate = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(flowUpdate?.payload).toMatchObject({ state: "quote_drafted" });
    expect(flowUpdate?.payload.context_json.selected_options).toEqual([
      { name: "ホイールコーティング", price: 8000, menuItemId: "menu-1" },
    ]);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("ホイールコーティング");
    expect(mocks.store.inserts.some((i) => i.table === "notifications")).toBe(true);
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("ホイールコーティング") }),
    );
  });

  it("returns false for an out-of-range option index", async () => {
    seedAwaitingOptionConfirm([]);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:option:0" });
    expect(handled).toBe(false);
    expect(mocks.store.updates.some((u) => u.table === "documents")).toBe(false);
  });

  it("ignores a redelivered option-select postback once the flow has already claimed the selection", async () => {
    // LINE の at-least-once 配信で同じ postback が再送された場合を模す。1回目の処理で
    // flow は既に quote_drafted まで進んでいるため、outer の state ガードで素通しされ、
    // 見積書は二重更新されない。
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "quote_drafted",
        quote_doc_id: DOC,
        context_json: { option_candidates: [OPTION], selected_options: [OPTION] },
      },
    ];
    mocks.store.tables.documents = [
      {
        id: DOC,
        items_json: [
          { item_type: "item", description: OPTION.name, quantity: 1, unit_price: OPTION.price, amount: OPTION.price },
        ],
        tax_rate: 10,
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:option:0" });
    expect(handled).toBe(false);
    expect(mocks.store.updates.some((u) => u.table === "documents")).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("converts the option's tax-exclusive catalog price to tax-inclusive when the quote is in tax-inclusive mode", async () => {
    seedAwaitingOptionConfirm();
    mocks.store.tables.documents = [
      {
        id: DOC,
        items_json: [{ item_type: "item", description: "コーティング", quantity: 1, unit_price: 33000, amount: 33000 }],
        tax_rate: 10,
        meta_json: { is_tax_inclusive: true },
        status: "sent",
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:option:0" });
    expect(handled).toBe(true);

    const docUpdate = mocks.store.updates.find((u) => u.table === "documents");
    expect(docUpdate?.payload).toMatchObject({ subtotal: 38000, tax: 3800, total: 41800 });
    // 税抜8000円 (登録メニュー価格) が税込8800円に換算されて追加されている。
    const items = docUpdate?.payload.items_json as Array<{ description: string; unit_price: number }>;
    expect(items.find((i) => i.description === OPTION.name)?.unit_price).toBe(8800);
  });

  it("options_none: proceeds straight to schedule candidates without changing the quote", async () => {
    seedAwaitingOptionConfirm();
    seedOpenSlots(mocks.store);

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:options_none" });
    expect(handled).toBe(true);
    expect(mocks.store.updates.some((u) => u.table === "documents")).toBe(false);
    const flowUpdate = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(flowUpdate?.payload).toMatchObject({ state: "awaiting_schedule_pick" });
    expect(mocks.recordInboundLineMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("オプションなし") }),
    );
  });
});

describe("handleFlowPostback — final approval after option add (Phase 2)", () => {
  function seedAwaitingFinalOk() {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_final_ok",
        quote_doc_id: DOC,
        context_json: { selected_options: [{ name: "ホイールコーティング", price: 8000, menuItemId: "menu-1" }] },
      },
    ];
  }

  it("final ok (yes): proceeds to schedule candidates", async () => {
    seedAwaitingFinalOk();
    seedOpenSlots(mocks.store);

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:yes" });
    expect(handled).toBe(true);
    const flowUpdate = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(flowUpdate?.payload).toMatchObject({ state: "awaiting_schedule_pick" });
  });

  it("final ok (no / 相談する): hands off to staff with a consult message", async () => {
    seedAwaitingFinalOk();

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:no" });
    expect(handled).toBe(true);
    const flowUpdate = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(flowUpdate?.payload).toMatchObject({ state: "human_takeover" });
    expect(flowUpdate?.payload.context_json).toMatchObject({ final_decision: "consult" });
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("相談");
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
    // 管理画面の予約作成ルートと同じ intake フック (勘定科目提案・ワークフロー提案) も呼ぶ。
    expect(mocks.maybeAutoCategorizeReservationOnIntake).toHaveBeenCalledWith({
      tenantId: TENANT,
      reservationId: inserted?.payload.id,
    });
    expect(mocks.maybeAutoProposeWorkflowForReservation).toHaveBeenCalledWith({
      tenantId: TENANT,
      reservationId: inserted?.payload.id,
    });

    // 選択の排他確保 (awaiting_schedule_pick → scheduled) → 確定 (→ closed) の2回更新される。
    const flowUpdates = mocks.store.updates.filter((u) => u.table === "line_conversation_flows");
    expect(flowUpdates.map((u) => u.payload.state)).toEqual(["scheduled", "closed"]);
    const upd = flowUpdates[flowUpdates.length - 1];
    expect(upd?.payload.reservation_id).toBe(inserted?.payload.id);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("確定");
  });

  it("awaits the post-reservation intake hooks so serverless does not drop them after the LINE 200 (regression, same class as PR #761)", async () => {
    seedOpenSlots(mocks.store);
    seedAwaitingSchedulePick();
    mocks.store.tables.documents = [{ id: DOC, total: 33000 }];

    // intake フック (勘定科目提案・ワークフロー提案) をマクロタスク(setTimeout)で解決させ、
    // await されない撃ちっぱなしだと handleFlowPostback 解決時点で未完了 (=false) になるようにする。
    // マイクロタスクの内部 await は全て解決してから、マクロタスクの setTimeout が発火するため。
    let categorizeDone = false;
    let workflowDone = false;
    mocks.maybeAutoCategorizeReservationOnIntake.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            categorizeDone = true;
            resolve();
          }, 0),
        ),
    );
    mocks.maybeAutoProposeWorkflowForReservation.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            workflowDone = true;
            resolve();
          }, 0),
        ),
    );

    await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });

    // 予約が作られ (フックに到達し)、かつ両フックが await されて完走している。
    expect(mocks.store.inserts.some((i) => i.table === "reservations")).toBe(true);
    expect(categorizeDone).toBe(true);
    expect(workflowDone).toBe(true);
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

  it("links vehicle_id when the customer's stated vehicle matches exactly one registered vehicle (Phase 3)", async () => {
    seedOpenSlots(mocks.store);
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_schedule_pick",
        quote_doc_id: DOC,
        context_json: { schedule_candidates: [CANDIDATE], vehicle_text: "アルファード" },
      },
    ];
    mocks.store.tables.documents = [{ id: DOC, total: 33000 }];
    mocks.store.tables.vehicles = [
      {
        id: "veh-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        maker: "トヨタ",
        model: "アルファード",
        plate_display: null,
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(true);

    const inserted = mocks.store.inserts.find((i) => i.table === "reservations");
    expect(inserted?.payload).toMatchObject({ vehicle_id: "veh-1" });
  });

  it("leaves vehicle_id unset when the stated vehicle matches more than one registered vehicle (ambiguous, Phase 3)", async () => {
    seedOpenSlots(mocks.store);
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_schedule_pick",
        quote_doc_id: DOC,
        context_json: { schedule_candidates: [CANDIDATE], vehicle_text: "アルファード" },
      },
    ];
    mocks.store.tables.documents = [{ id: DOC, total: 33000 }];
    mocks.store.tables.vehicles = [
      {
        id: "veh-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        maker: "トヨタ",
        model: "アルファード",
        plate_display: null,
      },
      {
        id: "veh-2",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        maker: "トヨタ",
        model: "アルファード",
        plate_display: null,
      },
    ];

    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:slot:0" });
    expect(handled).toBe(true);

    const inserted = mocks.store.inserts.find((i) => i.table === "reservations");
    expect(inserted?.payload.vehicle_id).toBeNull();
  });
});

describe("handleFlowPostback — 誘導ボタン (FAQ返信の末尾)", () => {
  /** LINE_USER を CUSTOMER に紐付ける (start_quote は紐付け顧客が前提)。 */
  function linkCustomer() {
    mocks.store.tables.customers = [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: LINE_USER }];
  }

  it("flow:start_quote は紐付け顧客なら awaiting_quote_detail を customer_id 付きで作成し施工内容+車両を依頼する", async () => {
    linkCustomer();
    mocks.store.tables.line_conversation_flows = [];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(true);

    const inserted = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(inserted?.payload.state).toBe("awaiting_quote_detail");
    // 本番 webhook は customerId を渡さないため line_user_id から解決してキーを一致させる。
    expect(inserted?.payload.customer_id).toBe(CUSTOMER);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    // 施工内容が未知なので車両だけでなく施工内容も聞く (見積りに進めるため)。
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("施工内容");
  });

  it("flow:start_quote は未紐付けユーザーなら見積りフローを作らずスタッフ引き継ぎ (human_takeover) にする", async () => {
    // 未紐付けだと見積り下書きが作れずフローが詰まるため、awaiting_quote_detail は作らず
    // human_takeover マーカー＋通知でスタッフ対応に回す。
    mocks.store.tables.line_conversation_flows = [];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(true);
    const flowInsert = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flowInsert?.payload.state).toBe("human_takeover");
    expect(mocks.store.inserts.find((i) => i.table === "notifications")).toBeDefined();
  });

  it("flow:start_quote は配信失敗時に作成した awaiting_quote_detail 行を expired に落とす", async () => {
    linkCustomer();
    mocks.store.tables.line_conversation_flows = [];
    mocks.sendCustomerLineText.mockResolvedValueOnce(false);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(false);
    // 届かなかった詳細依頼のフロー行を残すと以降を塞ぐため expired にする。
    const expire = mocks.store.updates.find(
      (u) => u.table === "line_conversation_flows" && u.filters.state === "awaiting_quote_detail",
    );
    expect(expire?.payload.state).toBe("expired");
  });

  it("flow:start_quote は詳細待ちの進行中フローには詳細依頼を再送する (無反応にしない)", async () => {
    linkCustomer();
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-x",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_detail",
        quote_doc_id: null,
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(true);
    // 二重開始はしない (新規フローを作らない) が、詳細依頼は再送する。
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
  });

  it("flow:start_quote は詳細待ち以外の進行中フローでは false (スタッフ対応に委ねる)", async () => {
    linkCustomer();
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-x2",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_ok",
        quote_doc_id: DOC,
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("flow:consult はフロー不在時も durable な human_takeover マーカーを作り、通知＋案内する", async () => {
    // 失効マーカーの rot は createFlow の失効スイープが掃除するため安全に永続化できる。
    mocks.store.tables.line_conversation_flows = [];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:consult" });
    expect(handled).toBe(true);
    expect(mocks.store.inserts.find((i) => i.table === "notifications")).toBeDefined();
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const flowInsert = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(flowInsert?.payload.state).toBe("human_takeover");
  });

  it("flow:consult は進行中フローがあれば human_takeover に落とす (新規作成はしない)", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-y",
        tenant_id: TENANT,
        customer_id: null,
        line_user_id: LINE_USER,
        state: "awaiting_quote_ok",
        quote_doc_id: DOC,
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:consult" });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("human_takeover");
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });

  it("flow:consult は既に human_takeover なら冪等に no-op (二重通知しない)", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-z",
        tenant_id: TENANT,
        customer_id: null,
        line_user_id: LINE_USER,
        state: "human_takeover",
        quote_doc_id: null,
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:consult" });
    expect(handled).toBe(true);
    expect(mocks.store.inserts.find((i) => i.table === "notifications")).toBeUndefined();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("getActiveFlow は customer_id または line_user_id のどちらでもマッチする (紐付け前後で見失わない)", async () => {
    // 未紐付け時に line_user_id で作った human_takeover マーカーを、後から紐付いた顧客の
    // customerId で照会しても取りこぼさない (単一キー固定だと見失って抑止が切れる)。
    linkCustomer();
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-mk",
        tenant_id: TENANT,
        customer_id: null,
        line_user_id: LINE_USER,
        state: "human_takeover",
        quote_doc_id: null,
        context_json: {},
      },
    ];
    // consult は既存 human_takeover を見つけたら冪等 no-op になる = マーカーを発見できた証拠。
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:consult" });
    expect(handled).toBe(true);
    expect(mocks.store.inserts.find((i) => i.table === "notifications")).toBeUndefined();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("会話フロー opt-in OFF なら何もしない (false)", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });
});

describe("handleFlowPostback — 予約キャンセルのセルフ対応", () => {
  function seedCancelFlow(over: Record<string, unknown> = {}) {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "cf-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_cancel_confirm",
        reservation_id: "r-1",
        quote_doc_id: null,
        context_json: {
          purpose: "cancel",
          cancel_candidates: [
            { id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" },
          ],
        },
        ...over,
      },
    ];
  }

  it("実行: flow:cancel_confirm で予約をキャンセルし closed にする", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    seedCancelFlow();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_confirm" });
    expect(handled).toBe(true);
    expect(mocks.cancelReservationById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT, reservationId: "r-1", customerId: CUSTOMER }),
    );
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("closed");
    expect(mocks.sendCustomerLineText).toHaveBeenCalled();
  });

  it("取りやめ: flow:cancel_abort は closed にするがキャンセルは実行しない", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    seedCancelFlow();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_abort" });
    expect(handled).toBe(true);
    expect(mocks.cancelReservationById).not.toHaveBeenCalled();
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("closed");
  });

  it("選択: flow:cancel_pick:<i> で対象を確定し確認へ進める", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    seedCancelFlow({
      state: "awaiting_cancel_pick",
      reservation_id: null,
      context_json: {
        purpose: "cancel",
        cancel_candidates: [
          { id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "A" },
          { id: "r-2", scheduled_date: "2026-09-05", start_time: "14:00:00", title: "B" },
        ],
      },
    });
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_pick:1" });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("awaiting_cancel_confirm");
    expect(upd?.payload.reservation_id).toBe("r-2");
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalled();
    expect(mocks.cancelReservationById).not.toHaveBeenCalled();
  });

  it("確定直前の再検証: 当日入りしていたら実行せずスタッフ引き継ぎ", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    mocks.todayJst.mockReturnValue("2026-09-01");
    seedCancelFlow(); // 候補 r-1 は 2026-09-01 = 当日
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_confirm" });
    expect(handled).toBe(true);
    expect(mocks.cancelReservationById).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).toHaveBeenCalled();
  });

  it("会話フロー OFF でも自己キャンセル opt-in が ON なら処理する", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    seedCancelFlow();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_confirm" });
    expect(handled).toBe(true);
    expect(mocks.cancelReservationById).toHaveBeenCalled();
  });

  it("会話フロー OFF かつ自己キャンセル OFF なら何もしない", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    mocks.shouldAutoSelfCancel.mockReturnValue(false);
    seedCancelFlow();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_confirm" });
    expect(handled).toBe(false);
    expect(mocks.cancelReservationById).not.toHaveBeenCalled();
  });

  it("選択で確認ボタンが届かなければ awaiting_cancel_confirm を残さず expired に落とす", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    mocks.sendCustomerLineButtons.mockResolvedValue(false);
    seedCancelFlow({
      state: "awaiting_cancel_pick",
      reservation_id: null,
      context_json: {
        purpose: "cancel",
        cancel_candidates: [{ id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "A" }],
      },
    });
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel_pick:0" });
    expect(handled).toBe(false);
    expect(
      mocks.store.updates.some((u) => u.table === "line_conversation_flows" && u.payload.state === "expired"),
    ).toBe(true);
  });

  it("flow:consult は会話フロー OFF でも自己キャンセル opt-in が ON なら受ける (死にボタン回避)", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    // 進行中フロー無し → durable な human_takeover マーカーを作って引き継ぐ。
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:consult" });
    expect(handled).toBe(true);
    const marker = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(marker?.payload.state).toBe("human_takeover");
  });
});

describe("handleFlowPostback — 予約の日程変更のセルフ対応", () => {
  function todayYmd(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  // seedOpenSlots は全曜日 09:00-18:00 を空けるため、今日が常に 1 件目の候補になる。
  const CANDIDATE = { date: todayYmd(), start_time: "09:00", end_time: "18:00" };
  const TARGET = { id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "コーティング" };

  function seedRescheduleSlot(over: Record<string, unknown> = {}) {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "cf-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_reschedule_slot",
        reservation_id: "r-1",
        quote_doc_id: null,
        context_json: { purpose: "reschedule", reschedule_target: TARGET, schedule_candidates: [CANDIDATE] },
        ...over,
      },
    ];
  }

  it("選択: flow:reschedule_pick:<i> で対象を確定し新日程候補の提示へ進める", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    seedOpenSlots(mocks.store);
    mocks.store.tables.line_conversation_flows = [
      {
        id: "cf-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_reschedule_pick",
        reservation_id: null,
        context_json: {
          purpose: "reschedule",
          reschedule_candidates: [
            { id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "A" },
            { id: "r-2", scheduled_date: "2026-09-05", start_time: "14:00:00", title: "B" },
          ],
        },
      },
    ];
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_pick:1",
    });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("awaiting_reschedule_slot");
    expect(upd?.payload.reservation_id).toBe("r-2");
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalled();
    expect(mocks.rescheduleReservationById).not.toHaveBeenCalled();
    // 変更先候補は「前日まで」= 当日 (mocked today 2026-08-26) を含めず翌日以降のみ。
    const offered = (upd?.payload.context_json?.schedule_candidates ?? []) as Array<{ date: string }>;
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((c) => c.date > "2026-08-26")).toBe(true);
  });

  it("選択で空き候補が無ければスタッフ引き継ぎ (human_takeover)", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    // seedOpenSlots しない → 候補ゼロ件。
    mocks.store.tables.line_conversation_flows = [
      {
        id: "cf-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_reschedule_pick",
        reservation_id: null,
        context_json: {
          purpose: "reschedule",
          reschedule_candidates: [{ id: "r-1", scheduled_date: "2026-09-01", start_time: "10:00:00", title: "A" }],
        },
      },
    ];
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_pick:0",
    });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("human_takeover");
    expect(mocks.sendCustomerLineText).toHaveBeenCalled();
  });

  it("実行: flow:reschedule_slot で予約の日時を更新し closed にする", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    seedOpenSlots(mocks.store); // 再検証の空き枠。
    seedRescheduleSlot();
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_slot:0",
    });
    expect(handled).toBe(true);
    expect(mocks.rescheduleReservationById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT,
        reservationId: "r-1",
        customerId: CUSTOMER,
        newDate: CANDIDATE.date,
        newStartTime: CANDIDATE.start_time,
        newEndTime: CANDIDATE.end_time,
      }),
    );
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("closed");
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("変更しました");
  });

  it("再検証: 変更先が埋まっていたら更新せずスタッフ引き継ぎ", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    // seedOpenSlots しない → 再検証で空き無し = 埋まった扱い。
    seedRescheduleSlot();
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_slot:0",
    });
    expect(handled).toBe(true);
    expect(mocks.rescheduleReservationById).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("埋まって");
    // 変更希望は未達 → closed のままにせず human_takeover に移してスタッフが引き継げるようにする。
    const states = mocks.store.updates.filter((u) => u.table === "line_conversation_flows").map((u) => u.payload.state);
    expect(states).toContain("human_takeover");
  });

  it("確定直前の締め切り超過 (helper が too_late) はスタッフ引き継ぎ", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    mocks.rescheduleReservationById.mockResolvedValue({ ok: false, reason: "too_late" });
    seedOpenSlots(mocks.store);
    seedRescheduleSlot();
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_slot:0",
    });
    expect(handled).toBe(true);
    expect(mocks.sendCustomerLineText).toHaveBeenCalled();
  });

  it("「その他の日程を相談する」(flow:cancel) はスタッフ引き継ぎ", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    seedRescheduleSlot();
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:cancel" });
    expect(handled).toBe(true);
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.state).toBe("human_takeover");
    expect(mocks.rescheduleReservationById).not.toHaveBeenCalled();
  });

  it("会話フロー OFF でも自己日程変更 opt-in が ON なら処理する", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    seedOpenSlots(mocks.store);
    seedRescheduleSlot();
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:reschedule_slot:0",
    });
    expect(handled).toBe(true);
    expect(mocks.rescheduleReservationById).toHaveBeenCalled();
  });
});

describe("handleFlowPostback — リマインダーのセルフ操作ボタン", () => {
  it("flow:start_cancel は self-cancel opt-in が ON なら cancel フローを起動する", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_cancel" });
    expect(handled).toBe(true);
    expect(mocks.maybeStartCancelFlow).toHaveBeenCalledTimes(1);
    expect(mocks.maybeStartCancelFlow.mock.calls[0][0].intent).toBe("cancel");
  });

  it("flow:start_reschedule は self-reschedule opt-in が ON なら reschedule フローを起動する", async () => {
    mocks.shouldAutoSelfReschedule.mockReturnValue(true);
    const handled = await handleFlowPostback({
      tenantId: TENANT,
      lineUserId: LINE_USER,
      data: "flow:start_reschedule",
    });
    expect(handled).toBe(true);
    expect(mocks.maybeStartRescheduleFlow).toHaveBeenCalledTimes(1);
    expect(mocks.maybeStartRescheduleFlow.mock.calls[0][0].intent).toBe("change_reservation");
  });

  it("フロー起動不可 (進行中フロー有り等で false) でも無関係なフローを奪わず no-op で終える", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(true);
    mocks.maybeStartCancelFlow.mockResolvedValue(false);
    // 進行中の見積りフローがある状態でリマインダーのキャンセルボタンを押した想定。
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-x",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_ok",
        context_json: {},
      },
    ];
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_cancel" });
    expect(handled).toBe(true);
    // 進行中フローを human_takeover に奪わない (consult フォールバックしない)。
    const hijack = mocks.store.updates.find(
      (u) => u.table === "line_conversation_flows" && u.payload.state === "human_takeover",
    );
    expect(hijack).toBeUndefined();
  });

  it("flow:start_cancel は self-cancel opt-in が OFF なら受けない", async () => {
    mocks.shouldAutoSelfCancel.mockReturnValue(false);
    // 会話フローだけ ON にして先頭ゲートは通す (start_cancel 分岐は selfCancelOptIn を要求)。
    mocks.shouldRunConversationFlow.mockReturnValue(true);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_cancel" });
    expect(handled).toBe(false);
    expect(mocks.maybeStartCancelFlow).not.toHaveBeenCalled();
  });
});
