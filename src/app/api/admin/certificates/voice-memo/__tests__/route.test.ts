/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E4-7 回帰確認: 月次コストキャップ超過時に AI 呼び出しをスキップすることを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  canUse: vi.fn(),
  rateLimit: vi.fn(),
  reformat: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/billing/planFeatures", () => ({
  canUseFeature: mocks.canUse,
  normalizePlanTier: (t: string) => t,
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/voiceMemoReformat", () => ({ reformatVoiceMemo: mocks.reformat }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/certificates/voice-memo", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin", planTier: "standard" });
  mocks.canUse.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.reformat.mockResolvedValue({ title: "オイル交換" });
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
});

describe("POST /api/admin/certificates/voice-memo", () => {
  it("returns the draft on success", async () => {
    const res = await POST(post({ transcript: "オイル交換した" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, draft: { title: "オイル交換" } });
  });

  it("returns ok:false without calling reformatVoiceMemo when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ transcript: "オイル交換した" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "ai_unavailable" });
    expect(mocks.reformat).not.toHaveBeenCalled();
  });
});
