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
});

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

  it("on OK: hands off to staff for scheduling and acks the customer", async () => {
    seedAwaitingOk();
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
