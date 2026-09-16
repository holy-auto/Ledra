import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  requirePermission: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST } from "@/app/api/admin/integrations/api-keys/route";

const ADMIN_CALLER = { userId: "u1", tenantId: "t1", role: "admin", planTier: "pro" };

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/integrations/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.requirePermission.mockReturnValue(true);
  process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";
});

describe("GET /api/admin/integrations/api-keys", () => {
  it("401 when not authenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/api-keys"));
    expect(res.status).toBe(401);
  });

  it("derives status from revoked_at and expires_at", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 86_400_000).toISOString();
    const future = new Date(now.getTime() + 86_400_000).toISOString();

    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "k1",
                      prefix: "lk_live_a",
                      scopes: ["*"],
                      expires_at: future,
                      revoked_at: null,
                      last_used_at: null,
                      description: null,
                      created_at: now.toISOString(),
                    },
                    {
                      id: "k2",
                      prefix: "lk_live_b",
                      scopes: ["*"],
                      expires_at: past,
                      revoked_at: null,
                      last_used_at: null,
                      description: null,
                      created_at: now.toISOString(),
                    },
                    {
                      id: "k3",
                      prefix: "lk_live_c",
                      scopes: ["*"],
                      expires_at: null,
                      revoked_at: now.toISOString(),
                      last_used_at: null,
                      description: null,
                      created_at: now.toISOString(),
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      },
    });
    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/api-keys"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ id: string; status: string }> };
    expect(body.keys.map((k) => [k.id, k.status])).toEqual([
      ["k1", "active"],
      ["k2", "expired"],
      ["k3", "revoked"],
    ]);
  });
});

describe("POST /api/admin/integrations/api-keys", () => {
  it("400 on unknown scope", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const res = await POST(req({ scopes: ["bogus:scope"] }));
    expect(res.status).toBe(400);
  });

  it("400 on past expires_at", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const past = new Date(Date.now() - 1000).toISOString();
    const res = await POST(req({ scopes: ["certificates:read"], expires_at: past }));
    expect(res.status).toBe(400);
  });

  it("returns plaintext key on success", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    let inserted: Record<string, unknown> | null = null;
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: {
        from: () => ({
          insert: (doc: Record<string, unknown>) => {
            inserted = doc;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "k-new",
                      prefix: doc.prefix,
                      scopes: doc.scopes,
                      description: doc.description,
                      expires_at: null,
                      last_used_at: null,
                      revoked_at: null,
                      created_at: "2026-05-03",
                    },
                    error: null,
                  }),
              }),
            };
          },
        }),
      },
    });
    const res = await POST(req({ scopes: ["certificates:read", "customers:read"], description: "ETL" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; meta: { prefix: string; status: string } };
    expect(body.key).toMatch(/^lk_live_/);
    expect(body.meta.prefix).toBe(body.key.slice(0, 12));
    expect(body.meta.status).toBe("active");
    expect(inserted).toMatchObject({
      tenant_id: "t1",
      scopes: ["certificates:read", "customers:read"],
      description: "ETL",
      created_by: "u1",
    });
  });
});
