/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/gantt の認可・機能ゲート・date 検証を検証する。
 * 重い loadGanttData はモックし、route 固有のロジックだけを対象にする。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  featureVisible: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: mocks.resolveCaller }));
vi.mock("@/lib/features/serverVisibility", () => ({ isAdvancedFeatureVisibleForUser: mocks.featureVisible }));
vi.mock("@/lib/gantt/loadGanttData", () => ({ loadGanttData: mocks.load }));

import { GET } from "../route";

function req(url: string) {
  return new Request(url) as any;
}

const SENTINEL = { staff: [], cases: [], unassigned: [], isDemo: false, dateLabel: "x", staffCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ userId: "u1", tenantId: "t1", role: "admin" });
  mocks.featureVisible.mockResolvedValue(true);
  mocks.load.mockResolvedValue(SENTINEL);
});

describe("GET /api/admin/gantt", () => {
  it("401 when unauthenticated", async () => {
    mocks.resolveCaller.mockResolvedValue(null);
    const res = await GET(req("https://x/api/admin/gantt"));
    expect(res.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("404 when the advanced feature is not enabled", async () => {
    mocks.featureVisible.mockResolvedValue(false);
    const res = await GET(req("https://x/api/admin/gantt"));
    expect(res.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("200 and returns { data } on the happy path", async () => {
    const res = await GET(req("https://x/api/admin/gantt?date=2026-06-27"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: SENTINEL });
    expect(mocks.load).toHaveBeenCalledWith({}, "t1", "2026-06-27");
  });

  it("passes a valid date through unchanged", async () => {
    await GET(req("https://x/api/admin/gantt?date=2026-01-02"));
    expect(mocks.load.mock.calls[0][2]).toBe("2026-01-02");
  });

  it("falls back to a valid YYYY-MM-DD for garbage date input", async () => {
    await GET(req("https://x/api/admin/gantt?date=2026-13-99; DROP TABLE"));
    const usedDate = mocks.load.mock.calls[0][2];
    expect(usedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(usedDate).not.toContain("DROP");
  });
});
