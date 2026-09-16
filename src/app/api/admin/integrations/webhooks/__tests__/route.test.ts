import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  requirePermission: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCallerWithRole,
  requirePermission: mocks.requirePermission,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: mocks.createTenantScopedAdmin,
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST } from "@/app/api/admin/integrations/webhooks/route";

const ADMIN_CALLER = { userId: "u1", tenantId: "t1", role: "admin", planTier: "pro" };

function req(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/integrations/webhooks", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.requirePermission.mockReturnValue(true);
});

describe("GET /api/admin/integrations/webhooks", () => {
  it("401 when not authenticated", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/webhooks"));
    expect(res.status).toBe(401);
  });

  it("403 when missing settings:view permission", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    mocks.requirePermission.mockReturnValueOnce(false);
    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/webhooks"));
    expect(res.status).toBe(403);
  });

  it("returns webhooks with masked secret", async () => {
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
                      id: "w1",
                      url: "https://example.com/hook",
                      topics: ["*"],
                      secret: "whsec_supersecretthing",
                      description: "test",
                      is_active: true,
                      last_delivery_at: null,
                      last_delivery_status: null,
                      last_delivery_error: null,
                      created_at: "2026-05-03",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      },
    });

    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/webhooks"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; webhooks: Array<{ secret: string; id: string }> };
    expect(body.webhooks[0].id).toBe("w1");
    // Secret is masked: first 4 + "..." + last 4 chars.
    expect(body.webhooks[0].secret).toBe("whse...hing");
  });
});

describe("POST /api/admin/integrations/webhooks", () => {
  it("400 on invalid url scheme", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const res = await POST(req({ url: "http://example.com/hook", topics: ["*"] }));
    expect(res.status).toBe(400);
  });

  it("400 on empty topics", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const res = await POST(req({ url: "https://example.com/hook", topics: [] }));
    expect(res.status).toBe(400);
  });

  it("creates and returns plaintext secret", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "w-new",
                    url: "https://example.com/hook",
                    topics: ["*"],
                    secret: "whsec_plaintext_value_for_test",
                    description: null,
                    is_active: true,
                    last_delivery_at: null,
                    last_delivery_status: null,
                    last_delivery_error: null,
                    created_at: "2026-05-03",
                  },
                  error: null,
                }),
            }),
          }),
        }),
      },
    });

    const res = await POST(req({ url: "https://example.com/hook", topics: ["certificate.issued"] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; webhook: { secret: string } };
    // Plaintext secret returned on creation (not masked).
    expect(body.webhook.secret).toBe("whsec_plaintext_value_for_test");
  });
});
