/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/mobile/auth/otp/request — サインアップ確認コードの発行・送信。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  checkRateLimit: vi.fn(),
  issueEmailOtp: vi.fn(),
  sendEmail: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({ auth: { admin: { getUserById: mocks.getUserById } } }),
}));
vi.mock("@/lib/auth/emailOtp", () => ({ issueEmailOtp: mocks.issueEmailOtp }));
vi.mock("@/lib/email/sendEmail", () => ({ sendEmail: mocks.sendEmail }));

import { POST } from "../route";

function req() {
  return new Request("http://localhost/api/mobile/auth/otp/request", { method: "POST" }) as any;
}

const CALLER = { userId: "u1", tenantId: "t1", role: "owner", supabase: {} };

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset().mockResolvedValue(CALLER);
  mocks.checkRateLimit.mockReset().mockResolvedValue(null);
  mocks.getUserById.mockReset().mockResolvedValue({ data: { user: { email: "owner@example.com" } }, error: null });
  mocks.issueEmailOtp.mockReset().mockResolvedValue("123456");
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true, id: "email-1", provider: "resend" });
});

describe("POST /api/mobile/auth/otp/request", () => {
  it("未認証は 401", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(null);
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(401);
    expect(mocks.issueEmailOtp).not.toHaveBeenCalled();
  });

  it("レート制限に達したらそのレスポンスを返す", async () => {
    const limited = new Response(null, { status: 429 });
    mocks.checkRateLimit.mockResolvedValue(limited);
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(429);
    expect(mocks.issueEmailOtp).not.toHaveBeenCalled();
  });

  it("正常系: コードを発行しメール送信する", async () => {
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(200);
    // レート制限バケットは verify 側と別（同じ userId を共有しても衝突しない識別子）。
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.anything(), "sensitive", "otp-request:u1");
    expect(mocks.issueEmailOtp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "t1", userId: "u1", email: "owner@example.com", purpose: "mobile_signup" }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const call = mocks.sendEmail.mock.calls[0][0];
    expect(call.to).toBe("owner@example.com");
    expect(call.html).toContain("123456");
  });

  it("メール送信に失敗したら 500 系エラーを返す", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, status: 500, error: "boom", provider: "resend" });
    const res = (await POST(req())) as Response;
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
