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
  generateExplanation: vi.fn(),
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
vi.mock("@/lib/ai/explainCertificate", () => ({ generateExplanation: mocks.generateExplanation }));
vi.mock("@/lib/ai/client", () => ({ modelForPlanTier: () => "sonnet" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/certificates/ai-explain", {
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
          if (table === "certificates") {
            return {
              data: {
                public_id: "pub1",
                created_at: "2026-01-01T00:00:00Z",
                expiry_date: null,
                customer_name: "山田太郎",
                customer_id: "c1",
                vehicle_id: null,
                tenant_id: "t1",
              },
              error: null,
            };
          }
          if (table === "tenants") {
            return { data: { name: "テスト店", phone: null }, error: null };
          }
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
  mocks.generateExplanation.mockResolvedValue("説明文です");
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
  mocks.createTenantScopedAdmin.mockReturnValue({ admin: buildAdmin() });
});

describe("POST /api/admin/certificates/ai-explain", () => {
  it("returns the explanation on success", async () => {
    const res = await POST(post({ certificate_id: CERT_ID, audience: "customer" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, explanation: "説明文です" });
  });

  it("returns 400 without calling generateExplanation when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ certificate_id: CERT_ID, audience: "customer" }));
    expect(res.status).toBe(400);
    expect(mocks.generateExplanation).not.toHaveBeenCalled();
  });
});
