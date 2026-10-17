import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantIdBySlugMock: vi.fn(),
  getLatestValidCodeRowMock: vi.fn(),
  markCodeAttemptMock: vi.fn().mockResolvedValue(undefined),
  markCodeUsedMock: vi.fn().mockResolvedValue(undefined),
  createSessionMock: vi.fn(),
  phoneLast4HashMock: vi.fn().mockReturnValue("hashed-phone"),
  otpCodeHashMock: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 4 }),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/customerPortalServer", () => ({
  createSession: mocks.createSessionMock,
  getLatestValidCodeRow: mocks.getLatestValidCodeRowMock,
  getTenantIdBySlug: mocks.getTenantIdBySlugMock,
  markCodeAttempt: mocks.markCodeAttemptMock,
  markCodeUsed: mocks.markCodeUsedMock,
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  otpCodeHash: mocks.otpCodeHashMock,
  phoneLast4Hash: mocks.phoneLast4HashMock,
  CUSTOMER_COOKIE: "hc_cs",
  OTP_MAX_ATTEMPTS: 3,
}));

const {
  getTenantIdBySlugMock,
  getLatestValidCodeRowMock,
  markCodeAttemptMock,
  markCodeUsedMock,
  createSessionMock,
  otpCodeHashMock,
} = mocks;

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/customer/verify-code/route";

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/customer/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  tenant_slug: "demo",
  email: "a@b.com",
  phone_last4: "1234",
  code: "123456",
};

describe("POST /api/customer/verify-code", () => {
  beforeEach(() => {
    getTenantIdBySlugMock.mockReset();
    getLatestValidCodeRowMock.mockReset();
    markCodeAttemptMock.mockClear();
    markCodeUsedMock.mockClear();
    createSessionMock.mockReset();
    otpCodeHashMock.mockReset();
  });

  it("returns 400 on invalid code format", async () => {
    const res = await POST(jsonReq({ ...validBody, code: "12" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 with generic invalid_code message when no code row exists — anti-enumeration", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    getLatestValidCodeRowMock.mockResolvedValueOnce(null);
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("invalid_code");
  });

  it("returns 400 with generic invalid_code message when tenant slug is unknown — anti-enumeration", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce(null);
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("invalid_code");
  });

  it("returns 400 when code is expired", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    getLatestValidCodeRowMock.mockResolvedValueOnce({
      id: "row-1",
      code_hash: "stored-hash",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      used_at: null,
      attempts: 0,
    });
    otpCodeHashMock.mockReturnValueOnce("stored-hash");

    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(400);
    expect(markCodeUsedMock).not.toHaveBeenCalled();
  });

  it("locks the row after OTP_MAX_ATTEMPTS (3) wrong guesses", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    getLatestValidCodeRowMock.mockResolvedValueOnce({
      id: "row-1",
      code_hash: "real-hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
      attempts: 2, // already 2 prior failures → 3rd will lock
    });
    otpCodeHashMock.mockReturnValueOnce("wrong-hash");

    const res = await POST(jsonReq(validBody));
    // 上限でも応答は他の失敗と同じ 400（429 だと「コードが実在する＝顧客」と分かる）
    expect(res.status).toBe(400);
    // markCodeAttempt called with attempts=3, then markCodeUsed to lock the row
    expect(markCodeAttemptMock).toHaveBeenCalledWith("row-1", 3);
    expect(markCodeUsedMock).toHaveBeenCalledWith("row-1");
  });

  it("issues a session cookie when the code matches", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    getLatestValidCodeRowMock.mockResolvedValueOnce({
      id: "row-1",
      code_hash: "real-hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
      attempts: 0,
    });
    otpCodeHashMock.mockReturnValueOnce("real-hash");
    createSessionMock.mockResolvedValueOnce({
      token: "session-token",
      expiresAtIso: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(200);
    expect(markCodeUsedMock).toHaveBeenCalledWith("row-1");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("hc_cs=session-token");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });
});
