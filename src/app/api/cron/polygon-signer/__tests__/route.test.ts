/**
 * cron/polygon-signer integration test.
 *
 * Verifies the production-safety invariants of the wallet-balance cron:
 *   - 401 when the cron auth header is missing/invalid
 *   - status=skipped (200) when POLYGON_ANCHOR_ENABLED!=='true' (dev safety)
 *   - status=skipped (200) when POLYGON_PRIVATE_KEY is unset
 *   - status=healthy when balance > warn threshold and no email is sent
 *   - status=warning + alert email when balance is between alert and warn
 *   - status=critical + alert email when balance is below alert threshold
 *   - status=error (200) when the RPC throws — the cron must NOT itself fail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { verifyCronRequestMock, getBalanceMock, fetchMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  getBalanceMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/cronAuth", () => ({
  verifyCronRequest: (...args: unknown[]) => verifyCronRequestMock(...args),
}));

vi.mock("viem", () => ({
  createPublicClient: () => ({
    getBalance: (...args: unknown[]) => getBalanceMock(...args),
  }),
  http: (url: string) => ({ url }),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: (key: string) => ({ address: `0xACC_${key.slice(2, 10)}` }),
}));

vi.mock("viem/chains", () => ({
  polygon: { id: 137, name: "polygon" },
  polygonAmoy: { id: 80002, name: "amoy" },
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

vi.mock("@/lib/cron/failureTracker", () => ({
  recordCronSuccess: vi.fn(),
  recordCronFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({}),
}));

import { GET } from "@/app/api/cron/polygon-signer/route";
import { NextRequest } from "next/server";

function req(): NextRequest {
  return new Request("http://localhost/api/cron/polygon-signer", {
    method: "GET",
    headers: { authorization: "Bearer test" },
  }) as unknown as NextRequest;
}

const ETH = (n: number) => BigInt(Math.round(n * 1e6)) * BigInt(1e12); // n POL → wei

describe("GET /api/cron/polygon-signer", () => {
  const ORIGINAL_FETCH = globalThis.fetch;

  beforeEach(() => {
    verifyCronRequestMock.mockReset().mockReturnValue({ authorized: true });
    getBalanceMock.mockReset();
    fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    process.env.POLYGON_ANCHOR_ENABLED = "true";
    process.env.POLYGON_NETWORK = "amoy";
    process.env.POLYGON_PRIVATE_KEY = "0xabcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01";
    process.env.POLYGON_WALLET_ALERT_BALANCE_POL = "0.1";
    process.env.POLYGON_WALLET_WARN_BALANCE_POL = "0.5";
    process.env.RESEND_API_KEY = "test-resend";
    process.env.RESEND_FROM = "noreply@example.com";
    process.env.CONTACT_TO_EMAIL = "ops@example.com";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("returns 401 when verifyCronRequest rejects", async () => {
    verifyCronRequestMock.mockReturnValueOnce({ authorized: false, error: "bad signature" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(getBalanceMock).not.toHaveBeenCalled();
  });

  it("status=skipped when POLYGON_ANCHOR_ENABLED is not 'true'", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "false";
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("skipped");
    expect(getBalanceMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("status=skipped when POLYGON_PRIVATE_KEY is unset", async () => {
    delete process.env.POLYGON_PRIVATE_KEY;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("skipped");
    expect(getBalanceMock).not.toHaveBeenCalled();
  });

  it("status=healthy + no email when balance is well above the warn threshold", async () => {
    getBalanceMock.mockResolvedValueOnce(ETH(2.5));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; balance_pol: string };
    expect(body.status).toBe("healthy");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("status=warning + alert email when balance is between alert and warn", async () => {
    getBalanceMock.mockResolvedValueOnce(ETH(0.3));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("warning");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as { body: string }).body) as { subject: string };
    expect(payload.subject).toContain("WARN");
  });

  it("status=critical + alert email when balance is below alert threshold", async () => {
    getBalanceMock.mockResolvedValueOnce(ETH(0.05));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("critical");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as { body: string }).body) as { subject: string };
    expect(payload.subject).toContain("CRITICAL");
  });

  it("status=error (200) when getBalance throws — the cron does NOT propagate the failure", async () => {
    getBalanceMock.mockRejectedValueOnce(new Error("rpc down"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe("error");
    expect(body.message).toContain("rpc down");
  });
});
