import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCallerWithRole: vi.fn(),
  createTenantScopedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveCallerWithRole: mocks.resolveCallerWithRole }));
vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: mocks.createTenantScopedAdmin }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, PUT } from "@/app/api/admin/ui-preferences/route";

const CALLER = { userId: "u1", tenantId: "t1", role: "staff", planTier: "pro" };

function request(body: unknown) {
  return new Request("http://localhost/api/admin/ui-preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
  return {
    upsert,
    admin: {
      from: vi.fn(() => ({ ...builder, upsert })),
    },
  };
}

beforeEach(() => {
  mocks.resolveCallerWithRole.mockReset();
  mocks.createTenantScopedAdmin.mockReset();
});

describe("admin UI preferences", () => {
  it("rejects unauthenticated reads", async () => {
    mocks.resolveCallerWithRole.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns a safe default for a first-time user", async () => {
    mocks.resolveCallerWithRole.mockResolvedValue(CALLER);
    const db = adminMock();
    mocks.createTenantScopedAdmin.mockReturnValue({ admin: db.admin, tenantId: "t1" });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      displayMode: "standard",
      onboardingCompleted: false,
    });
  });

  it("rejects an unknown display mode", async () => {
    mocks.resolveCallerWithRole.mockResolvedValue(CALLER);
    const response = await PUT(request({ displayMode: "expert" }) as never);
    expect(response.status).toBe(400);
  });

  it("stores only the caller's tenant and user preference", async () => {
    mocks.resolveCallerWithRole.mockResolvedValue(CALLER);
    const db = adminMock({ display_mode: "standard", onboarding_completed_at: null });
    mocks.createTenantScopedAdmin.mockReturnValue({ admin: db.admin, tenantId: "t1" });

    const response = await PUT(request({ displayMode: "dense", onboardingCompleted: true }) as never);
    expect(response.status).toBe(200);
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        user_id: "u1",
        display_mode: "dense",
        onboarding_completed_at: expect.any(String),
      }),
      { onConflict: "tenant_id,user_id" },
    );
  });
});
