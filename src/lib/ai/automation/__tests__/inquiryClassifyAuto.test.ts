/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/inquiryClassify", () => ({ classifyInquiry: (...a: any[]) => classifyMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoClassifyInquiry } from "../inquiryClassifyAuto";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../policy";
import { emptyStore, makeFakeAdmin } from "./fakeSupabaseAdmin";

const TENANT = "t1";
const INQ = "inq1";

const settings = (autoActions: Record<string, boolean>, enabled = true) => ({
  ...DEFAULT_AI_AUTOMATION_SETTINGS,
  enabled,
  autoActions,
});

const baseStore = () => emptyStore({ tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }] });

const params = {
  tenantId: TENANT,
  inquiryId: INQ,
  subject: "請求について",
  message: "金額が違う",
  customerName: "山田",
};

describe("maybeAutoClassifyInquiry (#1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classifyMock.mockResolvedValue({
      category: "billing",
      priority: "high",
      draft_reply: "ご連絡ありがとうございます。",
      reason: "請求",
      confidence: 0.8,
      ai: true,
    });
  });

  it("opt-in OFF: 分類しない", async () => {
    h.settings = settings({});
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoClassifyInquiry(params);
    expect(classifyMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("opt-in ON: customer_inquiries の ai_* 列を更新", async () => {
    h.settings = settings({ "inquiry.auto_classify": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoClassifyInquiry(params);
    expect(classifyMock).toHaveBeenCalledTimes(1);
    const upd = store.updates.find((u) => u.table === "customer_inquiries");
    expect(upd?.payload.ai_category).toBe("billing");
    expect(upd?.payload.ai_priority).toBe("high");
    expect(upd?.payload.ai_draft_reply).toBe("ご連絡ありがとうございます。");
    expect(upd?.payload.ai_classified_at).toBeTruthy();
  });

  it("本文が空: 分類しない", async () => {
    h.settings = settings({ "inquiry.auto_classify": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoClassifyInquiry({ ...params, message: "   " });
    expect(classifyMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });
});
