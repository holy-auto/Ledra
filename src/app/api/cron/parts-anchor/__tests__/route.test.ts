/**
 * E3-3 回帰確認: withCronLock が配線され、ロック未取得時は実処理を実行せずに
 * skipped を返すことを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { verifyCronRequestMock, withCronLockMock, anchorPendingInstallationsMock, recomputeVehicleMetaAnchorsMock } =
  vi.hoisted(() => ({
    verifyCronRequestMock: vi.fn(),
    withCronLockMock: vi.fn(),
    anchorPendingInstallationsMock: vi.fn(),
    recomputeVehicleMetaAnchorsMock: vi.fn(),
  }));

vi.mock("@/lib/cronAuth", () => ({
  verifyCronRequest: (...args: unknown[]) => verifyCronRequestMock(...args),
}));
vi.mock("@/lib/cron/lock", () => ({
  withCronLock: (...args: unknown[]) => withCronLockMock(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: vi.fn(() => ({})),
}));
vi.mock("@/lib/parts/anchorService", () => ({
  anchorPendingInstallations: (...args: unknown[]) => anchorPendingInstallationsMock(...args),
  recomputeVehicleMetaAnchors: (...args: unknown[]) => recomputeVehicleMetaAnchorsMock(...args),
}));

import { GET } from "@/app/api/cron/parts-anchor/route";

function req() {
  return new Request("http://localhost/api/cron/parts-anchor") as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/cron/parts-anchor", () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    verifyCronRequestMock.mockReturnValue({ authorized: true });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401 when unauthorized", async () => {
    verifyCronRequestMock.mockReturnValue({ authorized: false, error: "bad signature" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(withCronLockMock).not.toHaveBeenCalled();
  });

  it("ロック未取得なら skipped を返し、個別/メタアンカーを呼ばない", async () => {
    withCronLockMock.mockResolvedValue({ acquired: false });
    const res = await GET(req());
    const json = await res.json();
    expect(json).toMatchObject({ skipped: true, reason: "lock-held" });
    expect(anchorPendingInstallationsMock).not.toHaveBeenCalled();
    expect(recomputeVehicleMetaAnchorsMock).not.toHaveBeenCalled();
  });

  it("ロック取得できれば個別→メタの順で実行し結果を返す", async () => {
    withCronLockMock.mockImplementation(async (_s, _task, _ttl, fn) => ({ acquired: true, value: await fn() }));
    anchorPendingInstallationsMock.mockResolvedValue({ anchored: 2 });
    recomputeVehicleMetaAnchorsMock.mockResolvedValue({ recomputed: 5 });
    const res = await GET(req());
    const json = await res.json();
    expect(json).toEqual({ individual: { anchored: 2 }, meta: { recomputed: 5 } });
    expect(withCronLockMock).toHaveBeenCalledWith(expect.anything(), "parts-anchor", 300, expect.any(Function));
  });
});
