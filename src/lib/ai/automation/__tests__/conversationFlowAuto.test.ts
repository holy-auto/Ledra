import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldRunConversationFlow: vi.fn(),
  sendCustomerLineText: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({ shouldRunConversationFlow: mocks.shouldRunConversationFlow }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeStartQuoteFlow } from "../conversationFlowAuto";

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
  mocks.sendCustomerLineText.mockResolvedValue(true);
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
