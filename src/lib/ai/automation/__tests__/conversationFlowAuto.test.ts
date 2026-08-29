import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldRunConversationFlow: vi.fn(),
  isSourceAllowed: vi.fn(),
  sendCustomerLineText: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  createInboundQuoteDraft: vi.fn(),
  recordInboundLineMessage: vi.fn(),
  parseShakenshoAuto: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("../policy", () => ({
  loadAiAutomationSettings: mocks.loadAiAutomationSettings,
  isSourceAllowed: mocks.isSourceAllowed,
}));
vi.mock("../orchestrator", () => ({ shouldRunConversationFlow: mocks.shouldRunConversationFlow }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/line/messageStore", () => ({ recordInboundLineMessage: mocks.recordInboundLineMessage }));
vi.mock("@/lib/ocr/shakensho", () => ({ parseShakenshoAuto: mocks.parseShakenshoAuto }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("../quoteDraftCore", () => ({ createInboundQuoteDraft: mocks.createInboundQuoteDraft }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import {
  maybeStartQuoteFlow,
  maybeAdvanceQuoteFlowOnDetail,
  maybeAdvanceQuoteFlowOnPhoto,
} from "../conversationFlowAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";

function baseParams() {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    intent: "inquiry_only",
    service: "コーティング",
    vehicleText: "アルファード",
    messageId: "msg-1",
    channel: "line",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true }],
    line_conversation_flows: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.shouldRunConversationFlow.mockReturnValue(true);
  mocks.isSourceAllowed.mockReturnValue(true);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.recordInboundLineMessage.mockResolvedValue({ ok: true });
  mocks.createInboundQuoteDraft.mockResolvedValue({ docId: "doc-1", total: 132000, ai: true, confidence: 0.8 });
  mocks.parseShakenshoAuto.mockResolvedValue({
    data: { maker: "トヨタ", model: "6AA-MXPH15", first_registration: "2022年3月" },
  });
});

describe("maybeStartQuoteFlow", () => {
  it("creates an awaiting_quote_detail flow and asks for vehicle detail", async () => {
    await maybeStartQuoteFlow(baseParams());

    const inserted = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(inserted).toBeTruthy();
    expect(inserted!.payload).toMatchObject({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      state: "awaiting_quote_detail",
    });
    expect(inserted!.payload.context_json).toMatchObject({ service: "コーティング", vehicle_text: "アルファード" });

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body;
    expect(body).toContain("車検証");
    expect(body).toContain("車種");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "inbound_message.auto_conversation_flow" }),
    );
  });

  it("does not start (avoids contradictory double-message) when a reply already went out", async () => {
    await maybeStartQuoteFlow({ ...baseParams(), alreadyReplied: true });
    expect(mocks.store.inserts).toHaveLength(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing when opt-in is off", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    await maybeStartQuoteFlow(baseParams());
    expect(mocks.store.inserts).toHaveLength(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing without a LINE user id", async () => {
    await maybeStartQuoteFlow({ ...baseParams(), lineUserId: null });
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("skips non-price intents", async () => {
    await maybeStartQuoteFlow({ ...baseParams(), intent: "cancel" });
    expect(mocks.store.inserts).toHaveLength(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("skips when neither service nor vehicle could be read (avoids false starts)", async () => {
    await maybeStartQuoteFlow({ ...baseParams(), service: "", vehicleText: "" });
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not start a second flow when one is already active", async () => {
    mocks.store.tables.line_conversation_flows = [
      { tenant_id: TENANT, customer_id: CUSTOMER, line_user_id: LINE_USER, state: "awaiting_quote_ok" },
    ];
    await maybeStartQuoteFlow(baseParams());
    expect(mocks.store.inserts).toHaveLength(0);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not audit-log when the detail-ask delivery fails", async () => {
    mocks.sendCustomerLineText.mockResolvedValue(false);
    await maybeStartQuoteFlow(baseParams());
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });
});

function advanceParams() {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    service: "",
    vehicleText: "アルファード 2022年式",
    messageId: "msg-2",
    channel: "line",
  };
}

describe("maybeAdvanceQuoteFlowOnDetail", () => {
  beforeEach(() => {
    // 詳細待ちの進行中フロー (元の問い合わせで service を保持)。
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_detail",
        context_json: { service: "コーティング", vehicle_text: null },
      },
    ];
  });

  it("creates a formal quote draft from the detail reply, advances the flow, and acknowledges the customer", async () => {
    const handled = await maybeAdvanceQuoteFlowOnDetail(advanceParams());
    expect(handled).toBe(true);

    // 元の問い合わせの service + 今回の車両で下書きを作る。
    expect(mocks.createInboundQuoteDraft).toHaveBeenCalledTimes(1);
    const draftArg = mocks.createInboundQuoteDraft.mock.calls[0][1];
    expect(draftArg).toMatchObject({
      service: "コーティング",
      vehicleText: "アルファード 2022年式",
      origin: "conversation_flow",
    });

    // まず quote_drafted を排他クレーム、その後 doc_id を紐付ける (2 回更新)。
    const flowUpds = mocks.store.updates.filter((u) => u.table === "line_conversation_flows");
    expect(flowUpds[0].payload.state).toBe("quote_drafted");
    expect(flowUpds.some((u) => u.payload.quote_doc_id === "doc-1")).toBe(true);

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("正式なお見積り");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "inbound_message.auto_conversation_flow" }),
    );
  });

  it("returns false (not handled) when there is no active detail-waiting flow", async () => {
    mocks.store.tables.line_conversation_flows = [];
    const handled = await maybeAdvanceQuoteFlowOnDetail(advanceParams());
    expect(handled).toBe(false);
    expect(mocks.createInboundQuoteDraft).not.toHaveBeenCalled();
  });

  it("returns false when the flow is not in awaiting_quote_detail", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "quote_drafted",
        context_json: {},
      },
    ];
    const handled = await maybeAdvanceQuoteFlowOnDetail(advanceParams());
    expect(handled).toBe(false);
  });

  it("does not draft when the reply carries no vehicle detail (e.g. a question)", async () => {
    const handled = await maybeAdvanceQuoteFlowOnDetail({ ...advanceParams(), vehicleText: "" });
    expect(handled).toBe(false);
    expect(mocks.createInboundQuoteDraft).not.toHaveBeenCalled();
  });

  it("handles the message (returns true) but sends nothing when there is no pricing basis", async () => {
    mocks.createInboundQuoteDraft.mockResolvedValue(null);
    const handled = await maybeAdvanceQuoteFlowOnDetail(advanceParams());
    expect(handled).toBe(true); // フローを保持しつつ他の自動返信はしない
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing when opt-in is off", async () => {
    mocks.shouldRunConversationFlow.mockReturnValue(false);
    const handled = await maybeAdvanceQuoteFlowOnDetail(advanceParams());
    expect(handled).toBe(false);
    expect(mocks.createInboundQuoteDraft).not.toHaveBeenCalled();
  });
});

describe("maybeAdvanceQuoteFlowOnPhoto", () => {
  function seedFlow(context: Record<string, unknown>) {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-1",
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        line_user_id: LINE_USER,
        state: "awaiting_quote_detail",
        context_json: context,
      },
    ];
  }
  const photoParams = () => ({
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    imageBuffer: Buffer.from("fake-jpeg"),
    attachmentPath: "line-media/x.jpg",
    attachmentContentType: "image/jpeg",
    lineMessageId: "m-1",
  });

  it("OCRs the shakensho and drafts a quote when the service is already in context", async () => {
    seedFlow({ service: "コーティング", vehicle_text: null });
    const handled = await maybeAdvanceQuoteFlowOnPhoto(photoParams());
    expect(handled).toBe(true);
    expect(mocks.parseShakenshoAuto).toHaveBeenCalledTimes(1);
    // OCR の車両 + context の施工内容で下書きを作る。
    expect(mocks.createInboundQuoteDraft).toHaveBeenCalledTimes(1);
    const draftArg = mocks.createInboundQuoteDraft.mock.calls[0][1];
    expect(draftArg.service).toBe("コーティング");
    expect(draftArg.vehicleText).toContain("トヨタ");
    // 写真の受信をスレッドに記録する。
    expect(mocks.recordInboundLineMessage).toHaveBeenCalled();
  });

  it("keeps the OCR'd vehicle and asks only for the service when service is unknown", async () => {
    seedFlow({ source: "followup_button" }); // service 無し
    const handled = await maybeAdvanceQuoteFlowOnPhoto(photoParams());
    expect(handled).toBe(true);
    expect(mocks.createInboundQuoteDraft).not.toHaveBeenCalled();
    // context に車両を保持し、施工内容を聞き返す。
    const upd = mocks.store.updates.find((u) => u.table === "line_conversation_flows");
    expect(upd?.payload.context_json.vehicle_text).toContain("トヨタ");
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("施工内容");
  });

  it("does not handle (returns false) when the image cannot be read as a shakensho", async () => {
    seedFlow({ service: "コーティング" });
    mocks.parseShakenshoAuto.mockResolvedValue({ data: { maker: null } });
    const handled = await maybeAdvanceQuoteFlowOnPhoto(photoParams());
    expect(handled).toBe(false);
    // 未処理 → 通常の受信箱記録に委ねる (このハンドラでは記録しない)。
    expect(mocks.recordInboundLineMessage).not.toHaveBeenCalled();
  });

  it("does nothing when there is no awaiting_quote_detail flow", async () => {
    mocks.store.tables.line_conversation_flows = [];
    expect(await maybeAdvanceQuoteFlowOnPhoto(photoParams())).toBe(false);
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
  });

  it("does not OCR when the identity-documents source is disabled", async () => {
    mocks.isSourceAllowed.mockReturnValue(false);
    seedFlow({ service: "コーティング" });
    expect(await maybeAdvanceQuoteFlowOnPhoto(photoParams())).toBe(false);
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
  });
});
