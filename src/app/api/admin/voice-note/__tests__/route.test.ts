/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/voice-note の認可・プランゲート・検証・整形結果ハンドリングを検証する。
 * AI 整形 (reformatVoiceNote) はモックする。
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
// requireMinRole は実物を使う。差し替えると undefined になって呼び出しが投げ、
// 403 を期待するテストが 500 で落ちる（2026-09-01 に実際に落ちた）。
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/billing/planFeatures", () => ({
  canUseFeature: mocks.canUse,
  normalizePlanTier: (t: string) => t,
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/voiceMemoReformat", () => ({ reformatVoiceNote: mocks.reformat }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/voice-note", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin", planTier: "standard" });
  mocks.canUse.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.reformat.mockResolvedValue({ note: "・左ドア板金\n・要経過観察" });
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
});

describe("POST /api/admin/voice-note", () => {
  it("401 when unauthenticated", async () => {
    mocks.resolveCaller.mockResolvedValue(null);
    const res = await POST(post({ transcript: "x" }));
    expect(res.status).toBe(401);
  });

  it("403 when the plan cannot use ai_draft", async () => {
    mocks.canUse.mockReturnValue(false);
    const res = await POST(post({ transcript: "x" }));
    expect(res.status).toBe(403);
    expect(mocks.reformat).not.toHaveBeenCalled();
  });

  it("400 when transcript is empty", async () => {
    const res = await POST(post({ transcript: "" }));
    expect(res.status).toBe(400);
  });

  it("returns the formatted note on success", async () => {
    const res = await POST(post({ transcript: "左ドア板金して経過観察" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, note: "・左ドア板金\n・要経過観察" });
  });

  it("returns ok:false when the AI is unavailable", async () => {
    mocks.reformat.mockResolvedValue(null);
    const res = await POST(post({ transcript: "x" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("ai_unavailable");
  });

  // E4-7 回帰確認 (2026-09-08): 月次コストキャップ超過時は AI を呼ばない。
  it("returns ok:false without calling reformatVoiceNote when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ transcript: "x" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "ai_unavailable" });
    expect(mocks.reformat).not.toHaveBeenCalled();
  });
});
