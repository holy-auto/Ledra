/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const suggestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/caseAssignSuggest", () => ({ suggestCaseAssignees: (...a: any[]) => suggestMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoSuggestAssigneeForCase } from "../caseAssignAuto";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../policy";
import { emptyStore, makeFakeAdmin } from "./fakeSupabaseAdmin";

const TENANT = "t1";
const INSURER = "ins1";
const CASE = "case1";

const settings = (autoActions: Record<string, boolean>, enabled = true) => ({
  ...DEFAULT_AI_AUTOMATION_SETTINGS,
  enabled,
  autoActions,
});

const baseStore = (assignedTo: string | null = null) =>
  emptyStore({
    tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
    insurer_cases: [
      {
        id: CASE,
        insurer_id: INSURER,
        tenant_id: TENANT,
        title: "事故",
        description: "本文",
        priority: "high",
        category: "collision",
        assigned_to: assignedTo,
        meta: null,
      },
    ],
    insurer_users: [{ id: "u1", display_name: "担当A", insurer_id: INSURER }],
    insurer_assignment_rules: [],
  });

describe("maybeAutoSuggestAssigneeForCase (#4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suggestMock.mockResolvedValue({
      candidates: [{ user_id: "u1", user_name: "担当A", score: 0.8, method: "history", reason: "過去担当" }],
      ai: false,
    });
  });

  it("opt-in OFF: 提案しない", async () => {
    h.settings = settings({});
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoSuggestAssigneeForCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("opt-in ON: meta.ai_assign_suggestion を source=auto で保存", async () => {
    h.settings = settings({ "insurer_case.auto_assign_suggest": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoSuggestAssigneeForCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    const upd = store.updates.find((u) => u.table === "insurer_cases");
    expect(upd?.payload.meta.ai_assign_suggestion.source).toBe("auto");
    expect(upd?.payload.meta.ai_assign_suggestion.candidates).toHaveLength(1);
  });

  it("既にルールで割当済み (assigned_to あり) なら提案しない", async () => {
    h.settings = settings({ "insurer_case.auto_assign_suggest": true });
    const store = baseStore("someone");
    h.admin = makeFakeAdmin(store);
    await maybeAutoSuggestAssigneeForCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });
});
