/**
 * inboundAuto の自動返信ゲート結合テスト。
 *
 * 検証する不変条件:
 *   1. ナレッジ自動返信「だけ」を opt-in したテナントでも抽出→返信が動く
 *      (auto_extract の opt-in を前提にしない)。ただし ai_extracted は保存しない。
 *   2. ナレッジ返信が送られたら概算見積り返信はスキップ (二重返信防止)。
 *   3. どの opt-in も無ければ AI 抽出自体を走らせない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoExtractInbound: vi.fn(),
  shouldAutoReplyKnowledge: vi.fn(),
  shouldAutoReplyRoughEstimate: vi.fn(),
  decideInboundCommit: vi.fn(),
  extractInboundReservation: vi.fn(),
  fetchRecentConversation: vi.fn(),
  maybeAutoDraftQuoteFromInbound: vi.fn(),
  maybeAutoReplyRoughEstimate: vi.fn(),
  maybeAutoReplyKnowledge: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => makeFakeAdmin(mocks.store),
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({
  shouldAutoExtractInbound: mocks.shouldAutoExtractInbound,
  shouldAutoReplyKnowledge: mocks.shouldAutoReplyKnowledge,
  shouldAutoReplyRoughEstimate: mocks.shouldAutoReplyRoughEstimate,
  decideInboundCommit: mocks.decideInboundCommit,
}));
vi.mock("../quoteDraftAuto", () => ({ maybeAutoDraftQuoteFromInbound: mocks.maybeAutoDraftQuoteFromInbound }));
vi.mock("../quoteReplyAuto", () => ({ maybeAutoReplyRoughEstimate: mocks.maybeAutoReplyRoughEstimate }));
vi.mock("../knowledgeReplyAuto", () => ({ maybeAutoReplyKnowledge: mocks.maybeAutoReplyKnowledge }));
vi.mock("@/lib/ai/inboundReservationExtract", () => ({
  extractInboundReservation: mocks.extractInboundReservation,
}));
vi.mock("@/lib/line/messageStore", () => ({ fetchRecentConversation: mocks.fetchRecentConversation }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "claude-haiku" }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeAutoProcessInboundMessage } from "../inboundAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";

function baseParams() {
  return {
    tenantId: TENANT,
    messageId: "msg-1",
    customerId: null,
    text: "営業時間を教えてください",
    channel: "line" as const,
    lineUserId: "Uabc123",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true, name: "HOLY自動車" }],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({ confidenceThreshold: 0.5 });
  mocks.shouldAutoExtractInbound.mockReturnValue(false);
  mocks.shouldAutoReplyKnowledge.mockReturnValue(false);
  mocks.shouldAutoReplyRoughEstimate.mockReturnValue(false);
  mocks.decideInboundCommit.mockReturnValue({ create: false, reason: "auto_create_off" });
  mocks.fetchRecentConversation.mockResolvedValue([]);
  mocks.extractInboundReservation.mockResolvedValue({ intent: "inquiry_only", confidence: 0.9, ai: true });
  mocks.maybeAutoReplyKnowledge.mockResolvedValue(false);
  mocks.maybeAutoReplyRoughEstimate.mockResolvedValue(false);
});

describe("maybeAutoProcessInboundMessage auto-reply gating", () => {
  it("runs extraction + knowledge reply when ONLY auto_reply_knowledge is opted in", async () => {
    mocks.shouldAutoReplyKnowledge.mockReturnValue(true);
    await maybeAutoProcessInboundMessage(baseParams());

    expect(mocks.extractInboundReservation).toHaveBeenCalledTimes(1);
    expect(mocks.maybeAutoReplyKnowledge).toHaveBeenCalledTimes(1);
    // auto_extract は OFF なので受信箱の下書き (ai_extracted) は保存しない。
    expect(mocks.store.updates.filter((u) => "ai_extracted" in u.payload)).toHaveLength(0);
  });

  it("saves ai_extracted only when auto_extract is opted in", async () => {
    mocks.shouldAutoExtractInbound.mockReturnValue(true);
    await maybeAutoProcessInboundMessage(baseParams());
    expect(mocks.store.updates.filter((u) => "ai_extracted" in u.payload)).toHaveLength(1);
  });

  it("skips the rough-estimate reply when the knowledge reply already replied", async () => {
    mocks.shouldAutoReplyKnowledge.mockReturnValue(true);
    mocks.shouldAutoReplyRoughEstimate.mockReturnValue(true);
    mocks.maybeAutoReplyKnowledge.mockResolvedValue(true);
    await maybeAutoProcessInboundMessage(baseParams());
    expect(mocks.maybeAutoReplyRoughEstimate).not.toHaveBeenCalled();
  });

  it("falls through to the rough-estimate reply when knowledge could not answer", async () => {
    mocks.shouldAutoReplyKnowledge.mockReturnValue(true);
    mocks.shouldAutoReplyRoughEstimate.mockReturnValue(true);
    mocks.maybeAutoReplyKnowledge.mockResolvedValue(false);
    await maybeAutoProcessInboundMessage(baseParams());
    expect(mocks.maybeAutoReplyRoughEstimate).toHaveBeenCalledTimes(1);
  });

  it("does not even run extraction when no relevant opt-in is enabled", async () => {
    await maybeAutoProcessInboundMessage(baseParams());
    expect(mocks.extractInboundReservation).not.toHaveBeenCalled();
    expect(mocks.maybeAutoReplyKnowledge).not.toHaveBeenCalled();
    expect(mocks.maybeAutoReplyRoughEstimate).not.toHaveBeenCalled();
  });

  it("fills empty service/vehicle from the deterministic fallback so the rough estimate can fire", async () => {
    // 本番で AI 抽出が service/vehicle を空で返し、概算見積りが沈黙した実メッセージ。
    mocks.shouldAutoReplyRoughEstimate.mockReturnValue(true);
    mocks.extractInboundReservation.mockResolvedValue({ intent: "inquiry_only", confidence: 0.72, ai: true });
    await maybeAutoProcessInboundMessage({
      ...baseParams(),
      text: "トヨタ　ハイエース　2026年式\nボディコーティング、ホイールコーティング",
    });
    expect(mocks.maybeAutoReplyRoughEstimate).toHaveBeenCalledTimes(1);
    const arg = mocks.maybeAutoReplyRoughEstimate.mock.calls[0][0];
    expect(arg.vehicleText).toBe("トヨタ ハイエース 2026年式");
    expect(arg.service).toBe("ボディコーティング, ホイールコーティング");
  });

  it("does not override a service/vehicle the AI did extract", async () => {
    mocks.shouldAutoReplyRoughEstimate.mockReturnValue(true);
    mocks.extractInboundReservation.mockResolvedValue({
      intent: "inquiry_only",
      confidence: 0.9,
      ai: true,
      service: "ガラスコーティング",
      vehicle: "レクサス LX",
    });
    await maybeAutoProcessInboundMessage({ ...baseParams(), text: "レクサスのコーティングお願いします" });
    const arg = mocks.maybeAutoReplyRoughEstimate.mock.calls[0][0];
    expect(arg.service).toBe("ガラスコーティング");
    expect(arg.vehicleText).toBe("レクサス LX");
  });
});
