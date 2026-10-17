import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantIdBySlugMock: vi.fn(),
  resolveUniqueCustomerIdMock: vi.fn(),
  createLoginCodeMock: vi.fn().mockResolvedValue(undefined),
  phoneLast4HashMock: vi.fn().mockReturnValue("hashed-phone"),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 4 }),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/customerPortalServer", () => ({
  createLoginCode: mocks.createLoginCodeMock,
  getTenantIdBySlug: mocks.getTenantIdBySlugMock,
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  phoneLast4Hash: mocks.phoneLast4HashMock,
  resolveUniqueCustomerId: mocks.resolveUniqueCustomerIdMock,
  OTP_TTL_MIN: 5,
}));

const { getTenantIdBySlugMock, resolveUniqueCustomerIdMock, createLoginCodeMock } = mocks;

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

const fetchMock = vi.fn();

import { POST } from "@/app/api/customer/request-code/route";
import { checkRateLimit } from "@/lib/rateLimit";

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/customer/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/customer/request-code", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "support@example.com";
    getTenantIdBySlugMock.mockReset();
    resolveUniqueCustomerIdMock.mockReset();
    createLoginCodeMock.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  it("returns 400 when last4 is missing", async () => {
    const res = await POST(jsonReq({ tenant_slug: "demo", email: "a@b.com" }));
    expect(res.status).toBe(400);
    expect(createLoginCodeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when last4 is not 4 digits", async () => {
    const res = await POST(jsonReq({ tenant_slug: "demo", email: "a@b.com", phone_last4: "abcd" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 (silently noop) when tenant slug is unknown — anti-enumeration", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce(null);
    const res = await POST(jsonReq({ tenant_slug: "nope", email: "a@b.com", phone_last4: "1234" }));
    expect(res.status).toBe(200);
    expect(createLoginCodeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 200 (silently noop) when no customer matches — anti-enumeration", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    resolveUniqueCustomerIdMock.mockResolvedValueOnce(null);
    const res = await POST(jsonReq({ tenant_slug: "demo", email: "a@b.com", phone_last4: "1234" }));
    expect(res.status).toBe(200);
    expect(createLoginCodeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a login code and sends email when input is valid", async () => {
    getTenantIdBySlugMock.mockResolvedValueOnce("tenant-1");
    resolveUniqueCustomerIdMock.mockResolvedValueOnce("cust-1");

    const res = await POST(jsonReq({ tenant_slug: "demo", email: "a@b.com", phone_last4: "1234" }));

    expect(res.status).toBe(200);
    // 下4桁だけでなく、入力メールでも顧客を確定してから送る（攻撃者のメールへは送らない）
    expect(resolveUniqueCustomerIdMock).toHaveBeenCalledWith("tenant-1", "hashed-phone", "a@b.com");
    expect(createLoginCodeMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();

    // Code expiry must use the current OTP_TTL_MIN constant (5 min).
    const [tenantId, , , code, expires] = createLoginCodeMock.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(/^\d{6}$/.test(code)).toBe(true);
    const ttlMs = new Date(expires).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(4 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
  });

  it("rejects when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSec: 30, remaining: 0 });
    const res = await POST(jsonReq({ tenant_slug: "demo", email: "a@b.com", phone_last4: "1234" }));
    expect(res.status).toBe(429);
  });
});
