import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, PUT } from "@/app/api/mobile/ui-preferences/route";

const CALLER = { userId: "mobile-user", tenantId: "tenant-a", role: "staff", supabase: {} };

function request(body?: unknown) {
  return new Request("http://localhost/api/mobile/ui-preferences", {
    method: body === undefined ? "GET" : "PUT",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function adminMock(row: { display_mode: string; onboarding_completed_at: string | null } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return { upsert, admin: { from: vi.fn(() => ({ ...builder, upsert })) } };
}

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
  mocks.createTenantScopedAdmin.mockReset();
});

describe("mobile UI preferences", () => {
  it("requires a bearer-authenticated mobile caller", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(null);
    expect((await GET(request() as never)).status).toBe(401);
  });

  it("returns the shared account preference", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(CALLER);
    const db = adminMock({ display_mode: "simple", onboarding_completed_at: "2026-08-28T00:00:00Z" });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin: db.admin, tenantId: "tenant-a" });

    await expect((await GET(request() as never)).json()).resolves.toMatchObject({
      ok: true,
      displayMode: "simple",
      onboardingCompleted: true,
    });
  });

  it("scopes updates to the authenticated tenant and user", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(CALLER);
    const db = adminMock({ display_mode: "standard", onboarding_completed_at: null });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin: db.admin, tenantId: "tenant-a" });

    const response = await PUT(request({ displayMode: "dense" }) as never);
    expect(response.status).toBe(200);
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-a", user_id: "mobile-user", display_mode: "dense" }),
      { onConflict: "tenant_id,user_id" },
    );
  });
});
