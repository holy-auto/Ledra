/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const summarizeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/caseSummary", () => ({ summarizeCase: (...a: any[]) => summarizeMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoSummarizeCase } from "../caseSummaryAuto";
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

const baseStore = () =>
  emptyStore({
    tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
    insurer_cases: [
      {
        id: CASE,
        insurer_id: INSURER,
        tenant_id: TENANT,
        title: "事故",
        description: "バンパー損傷",
        status: "open",
        priority: "high",
        certificate_id: null,
        vehicle_id: null,
        meta: null,
      },
    ],
  });

describe("maybeAutoSummarizeCase (#3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summarizeMock.mockResolvedValue({ lines: ["a", "b", "c"], confidence: 0.9, ai: true });
  });

  it("opt-in OFF: AI を呼ばず書き込まない", async () => {
    h.settings = settings({});
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoSummarizeCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(summarizeMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("opt-in ON: meta.ai_summary を source=auto で保存 + 監査ログ", async () => {
    h.settings = settings({ "insurer_case.auto_summary": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoSummarizeCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(summarizeMock).toHaveBeenCalledTimes(1);
    const upd = store.updates.find((u) => u.table === "insurer_cases");
    expect(upd?.payload.meta.ai_summary.source).toBe("auto");
    expect(upd?.payload.meta.ai_summary.lines).toEqual(["a", "b", "c"]);
    expect(store.inserts.some((i) => i.table === "insurer_access_logs")).toBe(true);
  });

  it("冪等: 既に source=auto があれば再実行しない", async () => {
    h.settings = settings({ "insurer_case.auto_summary": true });
    const store = baseStore();
    store.tables.insurer_cases[0].meta = { ai_summary: { source: "auto" } };
    h.admin = makeFakeAdmin(store);
    await maybeAutoSummarizeCase({ caseId: CASE, insurerId: INSURER, tenantId: TENANT });
    expect(summarizeMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("tenantId 無し: 壁3 (テナント未紐付け) はスキップ", async () => {
    h.settings = settings({ "insurer_case.auto_summary": true });
    h.admin = makeFakeAdmin(baseStore());
    await maybeAutoSummarizeCase({ caseId: CASE, insurerId: INSURER, tenantId: null });
    expect(summarizeMock).not.toHaveBeenCalled();
  });
});
