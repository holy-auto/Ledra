/**
 * 発行 Server Action の認可を固定する。
 *
 * 発行画面（Web）と `/api/admin/certificates` は両方ここを通るので、ガードは
 * ここ1箇所にある。ルート側の構造テスト（apiRoutePermissions.test.ts）は
 * route.ts の中しか見ないため、この経路はこのテストでしか守れない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createCertificate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCallerWithRole,
}));
vi.mock("@/lib/certificates/create", () => ({ createCertificate: mocks.createCertificate }));

import { createCertAction } from "../actions";

beforeEach(() => {
  mocks.resolveCallerWithRole.mockReset();
  mocks.createCertificate.mockReset();
  mocks.createCertificate.mockResolvedValue({ ok: true, public_id: "P-1" });
});

describe("createCertAction の認可", () => {
  it("未認証は unauthorized", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    await expect(createCertAction(new FormData())).resolves.toEqual({ ok: false, error: "unauthorized" });
    expect(mocks.createCertificate).not.toHaveBeenCalled();
  });

  it("viewer は forbidden（certificates:create を持たない）", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce({ userId: "u", tenantId: "t", role: "viewer" });
    await expect(createCertAction(new FormData())).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mocks.createCertificate).not.toHaveBeenCalled();
  });

  it("staff は通る", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce({ userId: "u", tenantId: "t", role: "staff" });
    await expect(createCertAction(new FormData())).resolves.toEqual({ ok: true, public_id: "P-1" });
    expect(mocks.createCertificate).toHaveBeenCalledTimes(1);
  });
});
