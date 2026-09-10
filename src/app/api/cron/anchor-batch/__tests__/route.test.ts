/**
 * E3-3 回帰確認: withCronLock が配線され、ロック未取得時は実処理を実行せずに
 * skipped を返すことを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { verifyCronRequestMock, withCronLockMock, runCertificateAnchorBatchMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  withCronLockMock: vi.fn(),
  runCertificateAnchorBatchMock: vi.fn(),
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
vi.mock("@/lib/anchoring/certificateBatchAnchor", () => ({
  runCertificateAnchorBatch: (...args: unknown[]) => runCertificateAnchorBatchMock(...args),
}));

import { GET } from "@/app/api/cron/anchor-batch/route";

function req() {
  return new Request("http://localhost/api/cron/anchor-batch") as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/cron/anchor-batch", () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    process.env.CERT_RECORD_ANCHOR_ENABLED = "true";
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

  it("ロック未取得なら skipped を返し、本処理を呼ばない", async () => {
    withCronLockMock.mockResolvedValue({ acquired: false });
    const res = await GET(req());
    const json = await res.json();
    expect(json).toMatchObject({ skipped: true, reason: "lock-held" });
    expect(runCertificateAnchorBatchMock).not.toHaveBeenCalled();
  });

  it("ロック取得できれば本処理を実行し結果を返す", async () => {
    withCronLockMock.mockImplementation(async (_s, _task, _ttl, fn) => ({ acquired: true, value: await fn() }));
    runCertificateAnchorBatchMock.mockResolvedValue({ anchored: 3 });
    const res = await GET(req());
    const json = await res.json();
    expect(json).toEqual({ anchored: 3 });
    expect(withCronLockMock).toHaveBeenCalledWith(expect.anything(), "anchor-batch", 300, expect.any(Function));
  });
});
