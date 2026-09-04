import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  tenantEligibleForAiAutomation: vi.fn(),
  shouldCaptureKnowledge: vi.fn(),
  generateKnowledgeCandidate: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("../policy", () => ({
  loadAiAutomationSettings: mocks.loadAiAutomationSettings,
  tenantEligibleForAiAutomation: mocks.tenantEligibleForAiAutomation,
}));
vi.mock("../orchestrator", () => ({ shouldCaptureKnowledge: mocks.shouldCaptureKnowledge }));
vi.mock("@/lib/ai/knowledgeCapture", () => ({ generateKnowledgeCandidate: mocks.generateKnowledgeCandidate }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "claude-haiku" }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeCaptureKnowledgeFromReply } from "../knowledgeCaptureAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";

function baseParams(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: "Uabc",
    staffReplyBody: "コーティングの施工時間は通常1日です。",
    sentByUserId: "staff-1",
    planTier: "pro",
    ...over,
  };
}

const REUSABLE = {
  reusable: true,
  title: "コーティングの施工時間",
  content: "通常1日いただいております。",
  confidence: 0.8,
  ai: true,
};

function seed(knowledge: Array<Record<string, unknown>> = [], messages: Array<Record<string, unknown>> = []) {
  mocks.store = emptyStore({
    tenant_line_knowledge: knowledge,
    customer_messages: messages,
    tenants: [{ id: TENANT, name: "テスト店" }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.tenantEligibleForAiAutomation.mockResolvedValue(true);
  mocks.shouldCaptureKnowledge.mockReturnValue(true);
  mocks.generateKnowledgeCandidate.mockResolvedValue(REUSABLE);
  seed(
    [],
    [
      {
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        direction: "inbound",
        body: "施工時間は？",
        created_at: "2026-08-30T00:00:00Z",
      },
    ],
  );
});

describe("maybeCaptureKnowledgeFromReply", () => {
  it("saves a reusable FAQ as a pending (enabled=false) knowledge entry and audits it", async () => {
    const ok = await maybeCaptureKnowledgeFromReply(baseParams());
    expect(ok).toBe(true);
    const ins = mocks.store.inserts.find((i) => i.table === "tenant_line_knowledge");
    expect(ins?.payload).toMatchObject({
      tenant_id: TENANT,
      title: "コーティングの施工時間",
      enabled: false, // 承認するまで Bot は使わない
      created_by: "staff-1",
    });
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "inbound_message.auto_capture_knowledge" }),
    );
  });

  it("does nothing when the opt-in is off", async () => {
    mocks.shouldCaptureKnowledge.mockReturnValue(false);
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.generateKnowledgeCandidate).not.toHaveBeenCalled();
    expect(mocks.store.inserts.find((i) => i.table === "tenant_line_knowledge")).toBeUndefined();
  });

  it("skips a non-reusable exchange (chit-chat / one-off)", async () => {
    mocks.generateKnowledgeCandidate.mockResolvedValue({ ...REUSABLE, reusable: false });
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "tenant_line_knowledge")).toBeUndefined();
  });

  it("skips a low-confidence candidate", async () => {
    mocks.generateKnowledgeCandidate.mockResolvedValue({ ...REUSABLE, confidence: 0.3 });
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "tenant_line_knowledge")).toBeUndefined();
  });

  it("skips when the knowledge base is already at the 50-entry cap", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ tenant_id: TENANT, title: `t${i}`, content: `c${i}` }));
    seed(full, [{ tenant_id: TENANT, customer_id: CUSTOMER, direction: "inbound", body: "施工時間は？" }]);
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.generateKnowledgeCandidate).not.toHaveBeenCalled();
  });

  it("skips a duplicate of an existing entry (same normalized title)", async () => {
    seed(
      [{ tenant_id: TENANT, title: "コーティングの施工時間", content: "既存の内容", enabled: true }],
      [{ tenant_id: TENANT, customer_id: CUSTOMER, direction: "inbound", body: "施工時間は？" }],
    );
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.store.inserts.find((i) => i.table === "tenant_line_knowledge")).toBeUndefined();
  });

  it("skips a trivial short reply without calling the AI", async () => {
    expect(await maybeCaptureKnowledgeFromReply(baseParams({ staffReplyBody: "承知しました" }))).toBe(false);
    expect(mocks.generateKnowledgeCandidate).not.toHaveBeenCalled();
  });

  it("stops capturing when too many unapproved (enabled=false) drafts are pending", async () => {
    const pending = Array.from({ length: 10 }, (_, i) => ({
      tenant_id: TENANT,
      title: `draft${i}`,
      content: `c${i}`,
      enabled: false,
    }));
    seed(pending, [{ tenant_id: TENANT, customer_id: CUSTOMER, direction: "inbound", body: "施工時間は？" }]);
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.generateKnowledgeCandidate).not.toHaveBeenCalled();
  });

  it("does nothing when the tenant is not eligible (plan/active gate)", async () => {
    mocks.tenantEligibleForAiAutomation.mockResolvedValue(false);
    expect(await maybeCaptureKnowledgeFromReply(baseParams())).toBe(false);
    expect(mocks.generateKnowledgeCandidate).not.toHaveBeenCalled();
  });
});
