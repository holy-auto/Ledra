/**
 * 横断マイページ（/api/portal）の request-code / verify-code。
 * - request-code: 該当なしでも同じ 200 { ok: true } を返す（メールが Ledra の顧客かを応答で分からせない）。
 * - verify-code: コード無し・使用済み・期限切れ・不一致を同じ 400 invalid_code にまとめ、
 *   OTP_MAX_ATTEMPTS 回の不一致でコードを使用済みにする（店ごとの customer/verify-code と同じ）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  listPortalMemberships: vi.fn(),
  createGlobalLoginCode: vi.fn(),
  getLatestGlobalCodeRow: vi.fn(),
  markGlobalCodeAttempt: vi.fn(),
  markGlobalCodeUsed: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0 }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/customerPortalServer", () => ({
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  normalizeLast4: (v: string) => v,
  OTP_MAX_ATTEMPTS: 3,
}));
vi.mock("@/lib/customerPortalGlobal", () => ({
  GLOBAL_OTP_TTL_MIN: 10,
  GLOBAL_PORTAL_COOKIE: "hc_cp",
  globalOtpCodeHash: (_e: string, _l: string, code: string) => `h:${code}`,
  createGlobalSession: vi.fn(),
  ...m,
}));
vi.mock("@/lib/email/sendEmail", () => ({ sendEmail: m.sendEmail }));

import { POST as requestCode } from "../request-code/route";
import { POST as verifyCode } from "../verify-code/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/portal/x", { method: "POST", body: JSON.stringify(body) });
const who = { email: "a@example.com", phone_last4: "1234" };
const future = new Date(Date.now() + 60_000).toISOString();

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.sendEmail.mockResolvedValue({ ok: true });
  m.markGlobalCodeAttempt.mockResolvedValue(true);
});

describe("POST /api/portal/request-code", () => {
  it("該当の有無で応答を変えない", async () => {
    m.listPortalMemberships.mockResolvedValueOnce([]);
    const none = await requestCode(req(who));
    m.listPortalMemberships.mockResolvedValueOnce([{ tenant_slug: "a" }, { tenant_slug: "b" }]);
    const hit = await requestCode(req(who));

    expect([none.status, hit.status]).toEqual([200, 200]);
    expect(await none.json()).toEqual(await hit.json());
    expect(m.sendEmail).toHaveBeenCalledTimes(1); // 送るのは該当ありのときだけ
  });

  it("該当ありでメール送信に失敗しても、該当なしと同じ応答にする", async () => {
    m.listPortalMemberships.mockResolvedValueOnce([]);
    const none = await requestCode(req(who));
    m.listPortalMemberships.mockResolvedValueOnce([{ tenant_slug: "a" }]);
    m.sendEmail.mockResolvedValueOnce({ ok: false, status: 422, error: "rejected" });
    const failed = await requestCode(req(who));

    expect([failed.status, await failed.json()]).toEqual([none.status, await none.json()]);
  });
});

describe("POST /api/portal/verify-code", () => {
  const wrong = { ...who, code: "000000" };

  it("コード無し・使用済み・期限切れ・不一致を同じ応答にする", async () => {
    const rows = [
      null,
      { id: "r", code_hash: "h:123456", expires_at: future, used_at: "2026-01-01", attempts: 0 },
      { id: "r", code_hash: "h:123456", expires_at: "2000-01-01", used_at: null, attempts: 0 },
      { id: "r", code_hash: "h:123456", expires_at: future, used_at: null, attempts: 0 },
    ];
    const bodies = [];
    for (const row of rows) {
      m.getLatestGlobalCodeRow.mockResolvedValueOnce(row);
      const res = await verifyCode(req(wrong));
      expect(res.status).toBe(400);
      bodies.push(await res.json());
    }
    for (const b of bodies) expect(b).toEqual(bodies[0]);
  });

  it("OTP_MAX_ATTEMPTS 回目の不一致でコードを使用済みにする", async () => {
    m.getLatestGlobalCodeRow.mockResolvedValueOnce({
      id: "r",
      code_hash: "h:123456",
      expires_at: future,
      used_at: null,
      attempts: 2,
    });
    const res = await verifyCode(req(wrong));
    // 上限でも応答は「コードが無い」ときと同じ（429 だとコードの実在＝顧客であることが分かる）
    m.getLatestGlobalCodeRow.mockResolvedValueOnce(null);
    const none = await verifyCode(req(wrong));
    expect([res.status, await res.json()]).toEqual([none.status, await none.json()]);
    expect(m.markGlobalCodeAttempt).toHaveBeenCalledWith("r", 2);
    expect(m.markGlobalCodeUsed).toHaveBeenCalledWith("r");
  });

  it("試行を予約できなければ（同時の試行に負けた）、正しいコードでも照合しない", async () => {
    m.getLatestGlobalCodeRow.mockResolvedValueOnce({
      id: "r",
      code_hash: "h:123456",
      expires_at: future,
      used_at: null,
      attempts: 0,
    });
    m.markGlobalCodeAttempt.mockResolvedValueOnce(false);
    const res = await verifyCode(req({ ...who, code: "123456" }));

    expect(res.status).toBe(400);
    expect(m.markGlobalCodeUsed).not.toHaveBeenCalled();
  });
});
