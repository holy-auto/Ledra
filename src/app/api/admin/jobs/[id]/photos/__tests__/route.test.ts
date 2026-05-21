/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requireMinRole: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "@/app/api/admin/jobs/[id]/photos/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const RES_ID = "33333333-3333-43d3-a333-333333333333";

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

function makeReq() {
  return new Request(`http://localhost/api/admin/jobs/${RES_ID}/photos`) as any;
}
function makeCtx() {
  return { params: Promise.resolve({ id: RES_ID }) };
}

function buildAdmin(scenarios: {
  reservation?: { data: unknown; error: unknown };
  certificates?: { data: unknown; error: unknown };
  certificate_images?: { data: unknown; error: unknown };
  signedUrl?: string | null;
}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const b: any = {
        select() {
          return b;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return b;
        },
        in(col: string, vals: unknown[]) {
          filters[`${col}__in`] = vals;
          return b;
        },
        order() {
          return b;
        },
        async maybeSingle() {
          if (table === "reservations") return scenarios.reservation ?? { data: null, error: null };
          return { data: null, error: null };
        },
        then(resolve: (v: any) => any, reject?: (e: any) => any) {
          if (table === "certificates") {
            return Promise.resolve(scenarios.certificates ?? { data: [], error: null }).then(resolve, reject);
          }
          if (table === "certificate_images") {
            return Promise.resolve(scenarios.certificate_images ?? { data: [], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return b;
    },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({
            data: { signedUrl: scenarios.signedUrl ?? "https://signed/x" },
            error: null,
          }),
        };
      },
    },
  };
}

describe("GET /api/admin/jobs/[id]/photos", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when reservation not found", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({ reservation: { data: null, error: null } }),
    });
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns photos with signed URLs and annotation counts", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        reservation: { data: { id: RES_ID, vehicle_id: "veh-1", customer_id: "cust-1" }, error: null },
        certificates: {
          data: [{ id: "cert-1", public_id: "PID1", status: "active", created_at: "2026-05-01" }],
          error: null,
        },
        certificate_images: {
          data: [
            {
              id: "img-1",
              certificate_id: "cert-1",
              storage_path: "tenant/cert/img-1.jpg",
              file_name: "front.jpg",
              content_type: "image/jpeg",
              file_size: 100,
              sort_order: 0,
              annotations: {
                version: 1,
                imageWidth: 100,
                imageHeight: 100,
                annotations: [{ id: "a1", kind: "arrow", color: "#f00", strokeWidth: 4, x1: 0, y1: 0, x2: 10, y2: 10 }],
              },
              created_at: "2026-05-02",
            },
            {
              id: "img-2",
              certificate_id: "cert-1",
              storage_path: "tenant/cert/img-2.jpg",
              file_name: "rear.jpg",
              content_type: "image/jpeg",
              file_size: 200,
              sort_order: 1,
              annotations: null,
              created_at: "2026-05-03",
            },
          ],
          error: null,
        },
        signedUrl: "https://signed/abc",
      }),
    });
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      photos: Array<{
        id: string;
        certificate_public_id: string | null;
        signed_url: string | null;
        annotation_count: number;
      }>;
    };
    expect(body.photos).toHaveLength(2);
    expect(body.photos[0].certificate_public_id).toBe("PID1");
    expect(body.photos[0].annotation_count).toBe(1);
    expect(body.photos[1].annotation_count).toBe(0);
    expect(body.photos[0].signed_url).toBe("https://signed/abc");
  });

  it("returns empty arrays when no certificates linked", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        reservation: { data: { id: RES_ID, vehicle_id: null, customer_id: null }, error: null },
      }),
    });
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { certificates: unknown[]; photos: unknown[] };
    expect(body.certificates).toHaveLength(0);
    expect(body.photos).toHaveLength(0);
  });
});
