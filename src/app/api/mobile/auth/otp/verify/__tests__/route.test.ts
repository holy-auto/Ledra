/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/mobile/auth/otp/verify — サインアップ確認コードの照合。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  checkRateLimit: vi.fn(),
  confirmEmailOtp: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({}) }));
vi.mock("@/lib/auth/emailOtp", () => ({ confirmEmailOtp: mocks.confirmEmailOtp }));

import { POST } from "../route";

function req(body: unknown) {
  return new Request("http://localhost/api/mobile/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const CALLER = { userId: "u1", tenantId: "t1", role: "owner", supabase: {} };

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset().mockResolvedValue(CALLER);
  mocks.checkRateLimit.mockReset().mockResolvedValue(null);
  mocks.confirmEmailOtp.mockReset();
});

describe("POST /api/mobile/auth/otp/verify", () => {
  it("未認証は 401", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(null);
    const res = (await POST(req({ code: "123456" }))) as Response;
    expect(res.status).toBe(401);
    expect(mocks.confirmEmailOtp).not.toHaveBeenCalled();
  });

  it("6桁でない code は 400（confirmEmailOtp を呼ばない）", async () => {
    const res = (await POST(req({ code: "123" }))) as Response;
    expect(res.status).toBe(400);
    expect(mocks.confirmEmailOtp).not.toHaveBeenCalled();
  });

  it("正しいコードは 200", async () => {
    mocks.confirmEmailOtp.mockResolvedValue({ ok: true });
    const res = (await POST(req({ code: "123456" }))) as Response;
    expect(res.status).toBe(200);
    expect(mocks.confirmEmailOtp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "t1", userId: "u1", purpose: "mobile_signup", code: "123456" }),
    );
    // レート制限バケットは request 側と別（同じ userId を共有しても衝突しない識別子）。
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.anything(), "sensitive", "otp-verify:u1");
  });

  it.each([
    ["not_found", "有効なコードがありません"],
    ["expired", "有効期限が切れました"],
    ["max_attempts", "上限に達しました"],
    ["mismatch", "正しくありません"],
  ])("%s は 400 で理由に応じたメッセージを返す", async (reason, expectedSubstring) => {
    mocks.confirmEmailOtp.mockResolvedValue({ ok: false, reason });
    const res = (await POST(req({ code: "123456" }))) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message ?? body.error).toContain(expectedSubstring);
  });
});
