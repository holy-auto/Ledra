/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E4-7 回帰確認: 月次コストキャップ超過時に AI 呼び出しをスキップすることを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  resolveOrgUserContext: vi.fn(),
  rateLimit: vi.fn(),
  resolveNavIntent: vi.fn(),
  loadAiAutomationSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCaller,
}));
vi.mock("@/lib/auth/orgAccess", () => ({ resolveOrgUserContext: mocks.resolveOrgUserContext }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/ai/navIntent", () => ({ resolveNavIntent: mocks.resolveNavIntent }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "haiku" }));
vi.mock("@/lib/ai/automation/policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({
  startAiRouteUsage: () => ({ record: vi.fn() }),
}));

import { POST } from "../route";

function post(body: unknown) {
  return new Request("https://x/api/admin/assistant/navigate", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin", planTier: "standard" });
  mocks.resolveOrgUserContext.mockResolvedValue(null);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.resolveNavIntent.mockResolvedValue({
    href: "/admin/reservations",
    reply: "予約一覧を開きます。",
    alternatives: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true });
});

describe("POST /api/admin/assistant/navigate", () => {
  it("returns the resolved intent on success", async () => {
    const res = await POST(post({ query: "予約一覧を開いて" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.href).toBe("/admin/reservations");
  });

  it("returns a cap-exceeded reply without calling resolveNavIntent when the monthly cost cap is exceeded", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false });
    const res = await POST(post({ query: "予約一覧を開いて" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.href).toBeNull();
    expect(mocks.resolveNavIntent).not.toHaveBeenCalled();
  });
});
