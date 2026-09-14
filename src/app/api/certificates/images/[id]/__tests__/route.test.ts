/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
  enqueueCertificateAnchor: vi.fn(),
}));

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createSupabaseServerClient }));
// モジュールごと差し替えると requirePermission が undefined になり、
// ルートのガードが TypeError → 500 になる。実物は残して解決だけ差し替える。
vi.mock("@/lib/auth/checkRole", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/checkRole")>()),
  resolveCallerWithRole: mocks.resolveCallerWithRole,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/anchoring/certificateAnchorService", () => ({
  enqueueCertificateAnchor: mocks.enqueueCertificateAnchor,
}));

import { DELETE } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const IMAGE_ID = "22222222-2222-42d2-a222-222222222222";
const CERT_ID = "33333333-3333-42d3-a333-333333333333";
const STORAGE_PATH = `${TENANT}/${CERT_ID}/photo.jpg`;

/**
 * Records call order across the storage-remove and DB-delete calls so the
 * test can assert *which happened first* — the whole point of the fix
 * (guarded DB delete must run before the storage object is destroyed).
 */
function buildAdmin(opts: { dbError?: { code: string; message: string } | null }) {
  const callOrder: string[] = [];
  const admin: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: IMAGE_ID, storage_path: STORAGE_PATH, certificate_id: CERT_ID, tenant_id: TENANT },
              error: null,
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => {
            callOrder.push("db_delete");
            return { error: opts.dbError ?? null };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        remove: async () => {
          callOrder.push("storage_remove");
          return { error: null };
        },
      }),
    },
  };
  return { admin, callOrder };
}

function makeReq() {
  return new Request("http://x/api/certificates/images/x", { method: "DELETE" }) as any;
}
const params = Promise.resolve({ id: IMAGE_ID });

beforeEach(() => {
  mocks.checkRateLimit.mockReset().mockResolvedValue(null);
  mocks.createSupabaseServerClient.mockReset().mockResolvedValue({});
  mocks.resolveCallerWithRole.mockReset().mockResolvedValue({ tenantId: TENANT, userId: "u1", role: "staff" });
  mocks.enqueueCertificateAnchor.mockReset().mockReturnValue({ catch: () => {} });
});

describe("DELETE /api/certificates/images/[id]", () => {
  it("deletes the guarded DB row before removing the storage object", async () => {
    const { admin, callOrder } = buildAdmin({ dbError: null });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await DELETE(makeReq(), { params });

    expect(res.status).toBe(200);
    expect(callOrder).toEqual(["db_delete", "storage_remove"]);
  });

  it("does not touch storage when certificate_images_guard blocks the delete (issued/void/expired cert)", async () => {
    const { admin, callOrder } = buildAdmin({
      dbError: { code: "P0001", message: "certificate_images: 発行済み/取消済み/期限切れ証明書の写真は削除できません" },
    });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin });

    const res = await DELETE(makeReq(), { params });

    expect(res.status).toBe(409);
    // The whole point of the fix: a blocked DB delete must never reach storage.
    expect(callOrder).toEqual(["db_delete"]);
  });
});
