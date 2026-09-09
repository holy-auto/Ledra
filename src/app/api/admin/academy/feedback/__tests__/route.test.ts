/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E4-7 回帰確認: 月次コストキャップ超過時に AI 呼び出しをスキップすることを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const CERT_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  canUse: vi.fn(),
  rateLimit: vi.fn(),
  generateCertificateFeedback: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/billing/planFeatures", () => ({ canUseFeature: mocks.canUse }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/academyFeedback", () => ({ generateCertificateFeedback: mocks.generateCertificateFeedback }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/academy/feedback", {
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
        limit() {
          return chain;
        },
        async single() {
          if (table === "certificates") return { data: { service_name: "コーティング" }, error: null };
          if (table === "certificate_quality_scores") return { data: null, error: null };
          if (table === "academy_progress") return { data: null, error: null };
          return { data: null, error: null };
        },
        then(resolve: (v: any) => any) {
          if (table === "academy_cases") return Promise.resolve({ data: [], error: null }).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
        async upsert() {
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
  mocks.canUse.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.generateCertificateFeedback.mockResolvedValue({ summary: "良好です" });
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
  mocks.createTenantScopedAdmin.mockReturnValue({ admin: buildAdmin() });
});

describe("POST /api/admin/academy/feedback", () => {
  it("returns the feedback on success", async () => {
    const res = await POST(post({ certificate_id: CERT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, feedback: { summary: "良好です" } });
  });

  it("returns 400 without calling generateCertificateFeedback when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ certificate_id: CERT_ID }));
    expect(res.status).toBe(400);
    expect(mocks.generateCertificateFeedback).not.toHaveBeenCalled();
  });
});
