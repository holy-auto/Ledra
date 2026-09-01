/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/certificates/void の権限強制（IMP-013 / 2026-08-31 の修正）。
 *
 * 修正前はテナントに所属してさえいれば誰でも通り、viewer でも証明書を
 * 恒久的に無効化できた（不可逆・法的意味を持つ操作）。同じ操作の他2経路
 * （admin/certificates/void, mobile/certificates/[id]/void）は admin 以上を
 * 要求していたため、この経路だけが抜け道になっていた。
 *
 * requirePermission / hasPermission / ROLE_PERMISSIONS は実物を使う。
 * 「呼んでいるが結果を捨てている」形の壊れ方も落とすため。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
  logCertificateAction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCallerWithRole,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/audit/certificateLog", () => ({
  logCertificateAction: mocks.logCertificateAction,
  getRequestMeta: () => ({ ip: null, userAgent: null }),
}));

import { POST } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PUBLIC_ID = "CERT-0123456789";

function req() {
  return new Request("http://localhost/api/certificates/void", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_id: PUBLIC_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.update.mockResolvedValue({ error: null });
  mocks.createTenantScopedAdmin.mockReturnValue({
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { id: "cert-1", vehicle_id: "veh-1", status: "active" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: (payload: any) => {
          mocks.update(payload);
          return { eq: () => ({ eq: () => mocks.update.mock.results.at(-1)?.value ?? { error: null } }) };
        },
      }),
    },
  });
});

function callerAs(role: string) {
  mocks.resolveCallerWithRole.mockResolvedValue({
    userId: "user-1",
    tenantId: TENANT,
    role,
    planTier: "pro",
  });
}

describe("POST /api/certificates/void — certificates:void の強制", () => {
  it.each(["viewer", "staff"])("%s は 403 で、無効化の書き込みが起きない", async (role) => {
    callerAs(role);
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logCertificateAction).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner", "super_admin"])("%s は無効化できる", async (role) => {
    callerAs(role);
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "void" }));
  });

  it("未認証は 401", async () => {
    mocks.resolveCallerWithRole.mockResolvedValue(null);
    const res = (await POST(req())) as Response;
    expect(res.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
