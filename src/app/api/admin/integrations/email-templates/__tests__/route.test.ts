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

import { GET, POST } from "@/app/api/admin/integrations/email-templates/route";

const ADMIN_CALLER = { userId: "u1", tenantId: "t1", role: "admin", planTier: "pro" };

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/integrations/email-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.requirePermission.mockReturnValue(true);
});

describe("GET /api/admin/integrations/email-templates", () => {
  it("returns overrides + missing default topics", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "tpl1",
                        topic: "booking_confirmation",
                        subject: "予約",
                        body_html: "<p>Hi</p>",
                        body_text: null,
                        is_active: true,
                        created_at: "2026-05-03",
                        updated_at: "2026-05-03",
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      },
    });
    const res = await GET(new NextRequest("http://localhost/api/admin/integrations/email-templates"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overrides: Array<{ topic: string }>;
      available_topics: string[];
      missing: string[];
    };
    expect(body.overrides[0].topic).toBe("booking_confirmation");
    expect(body.available_topics).toContain("booking_confirmation");
    expect(body.missing).not.toContain("booking_confirmation");
    expect(body.missing.length).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/integrations/email-templates", () => {
  it("400 when subject missing", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const res = await POST(postReq({ topic: "booking_confirmation", body_html: "<p>x</p>" }));
    expect(res.status).toBe(400);
  });

  it("deactivates existing then inserts new", async () => {
    mocks.resolveCallerWithRole.mockResolvedValueOnce(ADMIN_CALLER);
    const calls: string[] = [];
    let inserted: Record<string, unknown> | null = null;
    mocks.createTenantScopedAdmin.mockReturnValueOnce({
      admin: {
        from: () => ({
          update: (patch: Record<string, unknown>) => {
            calls.push(`update:${JSON.stringify(patch)}`);
            return {
              eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
            };
          },
          insert: (doc: Record<string, unknown>) => {
            inserted = doc;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "tpl-new", ...doc, created_at: "2026-05-03", updated_at: "2026-05-03" },
                    error: null,
                  }),
              }),
            };
          },
        }),
      },
    });
    const res = await POST(
      postReq({
        topic: "booking_confirmation",
        subject: "予約",
        body_html: "<p>Hello {{customer_name}}</p>",
      }),
    );
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.includes("is_active"))).toBe(true);
    expect(inserted).toMatchObject({
      tenant_id: "t1",
      topic: "booking_confirmation",
      is_active: true,
    });
  });
});
