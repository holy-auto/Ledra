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
}));
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

  it("会話フロー opt-in OFF なら何もしない (false)", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    const handled = await handleFlowPostback({ tenantId: TENANT, lineUserId: LINE_USER, data: "flow:start_quote" });
    expect(handled).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "line_conversation_flows")).toBeUndefined();
  });
});
