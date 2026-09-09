/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E4-7 回帰確認: 月次コストキャップ超過時に AI 呼び出しをスキップすることを検証する。
 *
 * code-review 指摘 (2026-09-09): enabled=false は「コストキャップ超過」と
 * 「管理者によるAI自動化トグルOFF」の両方で起こる。costCap.exceeded を見て
 * 原因を区別し、後者では「上限超過」と誤解させるメッセージを出さないことを
 * 併せて確認する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  canUse: vi.fn(),
  rateLimit: vi.fn(),
  generateQAAnswer: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/billing/planFeatures", () => ({ canUseFeature: mocks.canUse }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/qaAssistant", () => ({ generateQAAnswer: mocks.generateQAAnswer }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/academy/qa", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin", planTier: "standard" });
  mocks.canUse.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.generateQAAnswer.mockResolvedValue("回答です");
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
});

describe("POST /api/admin/academy/qa", () => {
  it("returns the answer on success", async () => {
    const res = await POST(post({ question: "オイル交換の頻度は？" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, answer: "回答です" });
  });

  it("returns ai_cost_cap_exceeded without calling generateQAAnswer when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({
      enabled: false,
      costCap: { capJpy: 1000, spentJpy: 1200, exceeded: true },
    });
    const res = await POST(post({ question: "オイル交換の頻度は？" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ai_cost_cap_exceeded");
    expect(mocks.generateQAAnswer).not.toHaveBeenCalled();
  });

  it("returns ai_automation_disabled (not the cost-cap message) when enabled=false but the cost cap is not exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({
      enabled: false,
      costCap: { capJpy: 1000, spentJpy: 100, exceeded: false },
    });
    const res = await POST(post({ question: "オイル交換の頻度は？" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ai_automation_disabled");
    expect(mocks.generateQAAnswer).not.toHaveBeenCalled();
  });
});
