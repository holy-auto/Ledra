import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoReplyKnowledge: vi.fn(),
  generateKnowledgeReply: vi.fn(),
  fetchRecentConversation: vi.fn(),
  sendCustomerLineText: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => makeFakeAdmin(mocks.store),
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({ shouldAutoReplyKnowledge: mocks.shouldAutoReplyKnowledge }));
vi.mock("@/lib/ai/knowledgeReply", () => ({ generateKnowledgeReply: mocks.generateKnowledgeReply }));
vi.mock("@/lib/line/messageStore", () => ({ fetchRecentConversation: mocks.fetchRecentConversation }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "claude-haiku" }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeAutoReplyKnowledge } from "../knowledgeReplyAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";

function baseParams() {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
    intent: "inquiry_only",
    text: "営業時間を教えてください",
    messageId: "msg-1",
    channel: "line",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true, name: "HOLY自動車" }],
    tenant_line_knowledge: [
      { tenant_id: TENANT, enabled: true, title: "営業時間", content: "平日 9:00〜18:00、日曜定休です。" },
    ],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({ confidenceThreshold: 0.5 });
  mocks.shouldAutoReplyKnowledge.mockReturnValue(true);
  mocks.fetchRecentConversation.mockResolvedValue([]);
  mocks.generateKnowledgeReply.mockResolvedValue({
    can_answer: true,
    reply: "営業時間は平日 9:00〜18:00、日曜定休です。",
    confidence: 0.9,
    ai: true,
  });
  mocks.sendCustomerLineText.mockResolvedValue(true);
});

describe("maybeAutoReplyKnowledge", () => {
  it("sends a knowledge-based reply and audits it", async () => {
    await maybeAutoReplyKnowledge(baseParams());

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const arg = mocks.sendCustomerLineText.mock.calls[0][0];
    expect(arg).toMatchObject({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });
    expect(arg.body).toContain("営業時間");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "inbound_message.auto_reply_knowledge" }),
    );
    // 登録ナレッジが生成器にそのまま渡る (回答ソースの固定)。
    const genArg = mocks.generateKnowledgeReply.mock.calls[0][0];
    expect(genArg.knowledge).toHaveLength(1);
    expect(genArg.knowledge[0]).toMatchObject({ title: "営業時間", content: "平日 9:00〜18:00、日曜定休です。" });
    expect(genArg.tenantName).toBe("HOLY自動車");
  });

  it("also replies to an unknown (unlinked) LINE user", async () => {
    await maybeAutoReplyKnowledge({ ...baseParams(), customerId: null });
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].customerId).toBeNull();
  });

  it("does nothing when opt-in is off", async () => {
    mocks.shouldAutoReplyKnowledge.mockReturnValue(false);
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.generateKnowledgeReply).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing without a LINE user id to reply to", async () => {
    await maybeAutoReplyKnowledge({ ...baseParams(), lineUserId: null });
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing when the tenant has no enabled knowledge", async () => {
    mocks.store.tables.tenant_line_knowledge = [
      { tenant_id: TENANT, enabled: false, title: "営業時間", content: "..." },
    ];
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.generateKnowledgeReply).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not send when the AI cannot answer from knowledge", async () => {
    mocks.generateKnowledgeReply.mockResolvedValue({ can_answer: false, confidence: 0.9, ai: true });
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });

  it("does not send below the tenant's confidence threshold", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ confidenceThreshold: 0.8 });
    mocks.generateKnowledgeReply.mockResolvedValue({
      can_answer: true,
      reply: "たぶん平日です。",
      confidence: 0.6,
      ai: true,
    });
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not send when the AI call failed (fallback result)", async () => {
    mocks.generateKnowledgeReply.mockResolvedValue({ can_answer: false, confidence: 0, ai: false });
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("skips cancel / change_reservation intents (staff must handle them)", async () => {
    await maybeAutoReplyKnowledge({ ...baseParams(), intent: "cancel" });
    await maybeAutoReplyKnowledge({ ...baseParams(), intent: "change_reservation" });
    expect(mocks.generateKnowledgeReply).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does not audit-log a reply that failed to deliver", async () => {
    mocks.sendCustomerLineText.mockResolvedValue(false);
    await maybeAutoReplyKnowledge(baseParams());
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });
});
