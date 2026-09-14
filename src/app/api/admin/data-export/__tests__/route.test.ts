/**
 * Tests for /api/admin/data-export.
 *
 * Contract:
 *   - 401 when unauthenticated
 *   - 403 when caller role is below owner (staff / admin should NOT be able to
 *     export full tenant data; that's the explicit privilege escalation gate)
 *   - 429 on rate limit (3/h per tenant+user)
 *   - 200 with JSON payload, tenant-scoped sections, and content-disposition
 *     header that triggers download
 *   - Audit row gets inserted (best-effort)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCallerMock, requireMinRoleMock, checkRateLimitMock, fromMock } = vi.hoisted(() => ({
  resolveCallerMock: vi.fn(),
  requireMinRoleMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal2" } }),
        },
      },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: (tenantId: string) => ({
    admin: { from: fromMock },
    tenantId,
  }),
}));

vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: (...args: unknown[]) => resolveCallerMock(...args),
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: () => "127.0.0.1",
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

import { GET } from "@/app/api/admin/data-export/route";
import { NextRequest } from "next/server";

function chainList(rows: Array<Record<string, unknown>>) {
  return {
    select: () => ({
      eq: () => ({
        range: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

function chainSingle(row: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  };
}

function req(): NextRequest {
  return new Request("http://localhost/api/admin/data-export", {
    headers: { "x-forwarded-for": "127.0.0.1" },
  }) as unknown as NextRequest;
}

describe("GET /api/admin/data-export", () => {
  beforeEach(() => {
    resolveCallerMock.mockReset();
    requireMinRoleMock.mockReset().mockReturnValue(true);
    checkRateLimitMock.mockReset().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 2 });
    fromMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is below owner (privilege escalation gate)", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1", role: "admin" });
    requireMinRoleMock.mockReturnValueOnce(false);
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns 429 when over the 3/h rate limit", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1", role: "owner" });
    requireMinRoleMock.mockReturnValueOnce(true);
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfterSec: 3600, remaining: 0 });
    const res = await GET(req());
    expect(res.status).toBe(429);
  });

  it("returns 200 JSON with sections + filename for download", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "tenant-A", role: "owner" });
    requireMinRoleMock.mockReturnValueOnce(true);

    fromMock.mockImplementation((table: string) => {
      switch (table) {
        case "tenants":
          return chainSingle({ id: "tenant-A", slug: "demo", name: "Demo", plan_tier: "standard" });
        case "certificates":
          return chainList([{ id: "c1", tenant_id: "tenant-A", public_id: "p1" }]);
        case "customers":
          return chainList([{ id: "cust-1", tenant_id: "tenant-A", name: "Tanaka" }]);
        case "vehicles":
          return chainList([]);
        case "invoices":
          return chainList([{ id: "inv-1", tenant_id: "tenant-A" }]);
        case "reservations":
          return chainList([]);
        case "tenant_memberships":
          return chainList([{ id: "m1", tenant_id: "tenant-A", user_id: "u-1", role: "owner" }]);
        case "vehicle_histories":
          // first call returns rows; subsequent ones (the audit insert) take the insert chain
          return {
            select: () => ({
              eq: () => ({
                range: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
            insert: () => ({
              then: (resolve: () => unknown) => Promise.resolve(undefined).then(resolve),
              catch: () => Promise.resolve(undefined),
            }),
          };
        default:
          return chainList([]);
      }
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="ledra-tenant-export-');
    expect(res.headers.get("x-robots-tag")).toContain("noindex");

    const body = (await res.json()) as {
      tenant: { id: string };
      sections: {
        certificates: { count: number; rows: unknown[] };
        customers: { count: number };
        invoices: { count: number };
      };
      exported_by: { user_id: string };
    };
    expect(body.tenant.id).toBe("tenant-A");
    expect(body.sections.certificates.count).toBe(1);
    expect(body.sections.customers.count).toBe(1);
    expect(body.sections.invoices.count).toBe(1);
    expect(body.exported_by.user_id).toBe("u-1");
  });

  it("filters by tenant_id on every section (no cross-tenant leakage)", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "tenant-A", role: "owner" });
    requireMinRoleMock.mockReturnValueOnce(true);

    const eqMock = vi.fn().mockReturnValue({
      range: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    });

    fromMock.mockReturnValue({
      select: () => ({ eq: eqMock }),
      insert: () => ({
        then: (r: () => unknown) => Promise.resolve(undefined).then(r),
        catch: () => Promise.resolve(),
      }),
    });

    await GET(req());

    // Every section query should have applied `.eq("tenant_id", "tenant-A")` or `.eq("id", "tenant-A")`.
    const calls = eqMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [col, val] of calls) {
      expect(["tenant_id", "id"]).toContain(col);
      expect(val).toBe("tenant-A");
    }
  });
});
