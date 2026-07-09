/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  issueCaptureNonce: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/certificates/captureNonce", () => ({ issueCaptureNonce: mocks.issueCaptureNonce }));

import { POST } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CERT_ID = "22222222-2222-42d2-a222-222222222222";
const PUBLIC_ID = "PID-ABC";

/** Minimal tenant-scoped supabase double: `.from().select().eq().eq().maybeSingle()`. */
function callerSupabase(certRow: unknown, capture?: { filters: Record<string, unknown> }) {
  const filters = capture?.filters ?? {};
  const b: any = {
    from: () => b,
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return b;
    },
    maybeSingle: async () => ({ data: certRow, error: null }),
  };
  return b;
}

function makeReq() {
  return new Request("http://x/api/mobile/certificates/x/capture-nonce", { method: "POST" }) as any;
}
const params = Promise.resolve({ id: CERT_ID });

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
  mocks.issueCaptureNonce.mockReset();
});

describe("POST /api/mobile/certificates/[id]/capture-nonce", () => {
  it("401 when unauthenticated", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce(null);
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
    expect(mocks.issueCaptureNonce).not.toHaveBeenCalled();
  });

  it("403 when role is below staff", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      role: "viewer",
      supabase: callerSupabase({ id: CERT_ID, public_id: PUBLIC_ID }),
    });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
    expect(mocks.issueCaptureNonce).not.toHaveBeenCalled();
  });

  it("404 when the certificate does not belong to the tenant", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      role: "staff",
      supabase: callerSupabase(null),
    });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(404);
    expect(mocks.issueCaptureNonce).not.toHaveBeenCalled();
  });

  it("issues a tenant+cert-bound nonce and returns it with public_id", async () => {
    const filters: Record<string, unknown> = {};
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      role: "staff",
      supabase: callerSupabase({ id: CERT_ID, public_id: PUBLIC_ID }, { filters }),
    });
    mocks.issueCaptureNonce.mockResolvedValueOnce("deadbeef");

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.capture_nonce).toBe("deadbeef");
    expect(body.public_id).toBe(PUBLIC_ID);
    // nonce is issued for exactly this cert + tenant
    expect(mocks.issueCaptureNonce).toHaveBeenCalledWith({ tenantId: TENANT, certificateId: CERT_ID });
    // ownership was enforced by filtering on both id and tenant_id
    expect(filters.id).toBe(CERT_ID);
    expect(filters.tenant_id).toBe(TENANT);
  });

  it("fail-open: returns 200 with capture_nonce null when issuance fails", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      role: "admin",
      supabase: callerSupabase({ id: CERT_ID, public_id: PUBLIC_ID }),
    });
    mocks.issueCaptureNonce.mockResolvedValueOnce(null);

    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.capture_nonce).toBeNull();
    expect(body.public_id).toBe(PUBLIC_ID);
  });
});
