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
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/admin/thickness-reports/[reportId]/link/route";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN_A = { userId: "u1", tenantId: TENANT_A, role: "admin", planTier: "pro" };
const REPORT_ID = "33333333-3333-4333-a333-333333333333";
const VEHICLE_ID = "44444444-4444-4444-a444-444444444444";
const OTHER_VEHICLE_ID = "55555555-5555-4555-a555-555555555555";

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
});

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/admin/thickness-reports/${REPORT_ID}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}
function makeCtx() {
  return { params: Promise.resolve({ reportId: REPORT_ID }) };
}

/** Minimal chainable supabase-admin stub keyed by table. */
function buildAdmin(scenarios: {
  report?: { data: unknown; error: unknown };
  vehicle?: { data: unknown; error: unknown };
  onUpdate?: () => void;
  onHistoryInsert?: () => void;
}) {
  return {
    from(table: string) {
      const b: any = {
        _table: table,
        select() {
          return b;
        },
        eq() {
          return b;
        },
        update() {
          scenarios.onUpdate?.();
          return b;
        },
        insert() {
          if (table === "vehicle_histories") scenarios.onHistoryInsert?.();
          return Promise.resolve({ data: null, error: null });
        },
        async maybeSingle() {
          if (table === "thickness_reports") return scenarios.report ?? { data: null, error: null };
          if (table === "vehicles") return scenarios.vehicle ?? { data: null, error: null };
          return { data: null, error: null };
        },
        async single() {
          if (table === "thickness_reports") return { data: { id: REPORT_ID, vehicle_id: VEHICLE_ID }, error: null };
          return { data: null, error: null };
        },
      };
      return b;
    },
  };
}

describe("POST /api/admin/thickness-reports/[reportId]/link", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ vehicle_id: VEHICLE_ID }), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when report not found in tenant", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({ report: { data: null, error: null } }),
      tenantId: TENANT_A,
    });
    const res = await POST(makeReq({ vehicle_id: VEHICLE_ID }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when vehicle not found in tenant", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        report: {
          data: { id: REPORT_ID, vehicle_id: null, name: "R", external_report_id: "1", vin: null },
          error: null,
        },
        vehicle: { data: null, error: null },
      }),
      tenantId: TENANT_A,
    });
    const res = await POST(makeReq({ vehicle_id: VEHICLE_ID }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 409 when already linked to another vehicle without force", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        report: {
          data: { id: REPORT_ID, vehicle_id: OTHER_VEHICLE_ID, name: "R", external_report_id: "1", vin: null },
          error: null,
        },
        vehicle: { data: { id: VEHICLE_ID, maker: "X", model: "Y", plate_display: "P" }, error: null },
      }),
      tenantId: TENANT_A,
    });
    const res = await POST(makeReq({ vehicle_id: VEHICLE_ID }), makeCtx());
    expect(res.status).toBe(409);
  });

  it("links report to vehicle and records history (happy path)", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_A);
    let historyInserted = false;
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: buildAdmin({
        report: {
          data: { id: REPORT_ID, vehicle_id: null, name: "R", external_report_id: "1", vin: "VIN123" },
          error: null,
        },
        vehicle: { data: { id: VEHICLE_ID, maker: "X", model: "Y", plate_display: "P" }, error: null },
        onHistoryInsert: () => {
          historyInserted = true;
        },
      }),
      tenantId: TENANT_A,
    });
    const res = await POST(makeReq({ vehicle_id: VEHICLE_ID }), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; vehicle_id: string };
    expect(body.ok).toBe(true);
    expect(body.vehicle_id).toBe(VEHICLE_ID);
    expect(historyInserted).toBe(true);
  });
});
