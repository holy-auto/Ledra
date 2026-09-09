/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E4-7 回帰確認: preview アクションで月次コストキャップ超過時に AI 呼び出しを
 * スキップすることを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  rateLimit: vi.fn(),
  generateAcademyCaseSummary: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/academyFeedback", () => ({ generateAcademyCaseSummary: mocks.generateAcademyCaseSummary }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/academy/cases", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

function buildAdmin() {
  return {
    from(table: string) {
      const chain: any = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async single() {
          if (table === "academy_cases") {
            return {
              data: {
                id: CASE_ID,
                certificate_id: "cert-1",
                category: "コーティング",
                quality_score: 90,
                is_candidate: true,
                tenant_id: "t1",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin", planTier: "standard" });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
  mocks.createTenantScopedAdmin.mockReturnValue({ admin: buildAdmin() });
});

describe("POST /api/admin/academy/cases (preview)", () => {
  it("returns 400 without calling generateAcademyCaseSummary when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ case_id: CASE_ID, action: "preview" }));
    expect(res.status).toBe(400);
    expect(mocks.generateAcademyCaseSummary).not.toHaveBeenCalled();
  });
});
