import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantIdBySlug: vi.fn(),
  validateSession: vi.fn(),
  listCertificatesForCustomer: vi.fn().mockResolvedValue([]),
  listHistoryForCustomer: vi.fn().mockResolvedValue([]),
  listReservationsForCustomer: vi.fn().mockResolvedValue([]),
  getCustomerProfile: vi.fn().mockResolvedValue(null),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/customerPortalServer", () => ({
  CUSTOMER_COOKIE: "hc_cs",
  getTenantIdBySlug: mocks.getTenantIdBySlug,
  validateSession: mocks.validateSession,
  listCertificatesForCustomer: mocks.listCertificatesForCustomer,
  listHistoryForCustomer: mocks.listHistoryForCustomer,
  listReservationsForCustomer: mocks.listReservationsForCustomer,
  getCustomerProfile: mocks.getCustomerProfile,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// B-M1 是正 (2026-09-08) 以降、"sensitive" プリセットは Redis 未設定でも
// 常にフェイルクローズ (503) するため、この経路のテストではレート制限自体を
// モックして本題（認可・データ整形）から切り離す。
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { GET } from "@/app/api/customer/data-export/route";

function req(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/customer/data-export", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
    mocks.listCertificatesForCustomer.mockResolvedValue([]);
    mocks.listHistoryForCustomer.mockResolvedValue([]);
    mocks.listReservationsForCustomer.mockResolvedValue([]);
    mocks.getCustomerProfile.mockResolvedValue(null);
  });

  it("returns 400 when tenant slug is missing", async () => {
    const res = await GET(req("https://app/api/customer/data-export"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown tenant slug", async () => {
    mocks.getTenantIdBySlug.mockResolvedValueOnce(null);
    const res = await GET(req("https://app/api/customer/data-export?tenant=nope"));
    expect(res.status).toBe(404);
  });

  it("returns 401 when session cookie is missing", async () => {
    mocks.getTenantIdBySlug.mockResolvedValueOnce("tenant-1");
    mocks.cookieGet.mockReturnValueOnce(undefined);
    const res = await GET(req("https://app/api/customer/data-export?tenant=demo"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is invalid", async () => {
    mocks.getTenantIdBySlug.mockResolvedValueOnce("tenant-1");
    mocks.cookieGet.mockReturnValueOnce({ value: "bad-token" });
    mocks.validateSession.mockResolvedValueOnce(null);
    const res = await GET(req("https://app/api/customer/data-export?tenant=demo"));
    expect(res.status).toBe(401);
  });

  it("returns a JSON download bundle when authenticated", async () => {
    mocks.getTenantIdBySlug.mockResolvedValueOnce("tenant-1");
    mocks.cookieGet.mockReturnValueOnce({ value: "good-token" });
    mocks.validateSession.mockResolvedValueOnce({
      email: "a@b.com",
      phone_last4_hash: "hash",
      phone_last4: "1234",
      customer_id: "cust-1",
    });
    mocks.getCustomerProfile.mockResolvedValueOnce({
      name: "山田",
      email: "a@b.com",
      phone: "090-0000-1234",
      certificateCount: 2,
    });
    mocks.listCertificatesForCustomer.mockResolvedValueOnce([{ public_id: "abc" }]);

    const res = await GET(req("https://app/api/customer/data-export?tenant=demo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.schema_version).toBe("1.0");
    expect((body.tenant as { slug: string }).slug).toBe("demo");
    expect((body.profile as { name: string }).name).toBe("山田");
    expect(Array.isArray(body.certificates)).toBe(true);
    expect((body.metadata as { notice: string }).notice).toContain("GDPR");
  });
});
