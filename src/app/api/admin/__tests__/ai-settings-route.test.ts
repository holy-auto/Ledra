/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET / PUT /api/admin/settings/ai-automation の挙動を検証する。
 *
 * - 認証なし → 401
 * - role=member の PUT → 403 (admin 以上が必要)
 * - 未知の field key / 不正な policy 値 / 不正な source key を含む payload は
 *   サニタイズされて保存される
 * - 未マイグレーション (PGRST205 / does not exist) は warning + persisted=false で 200
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  loadSettings: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: () => ({
        upsert: mocks.upsert,
      }),
    },
    tenantId: "tenant-1",
  }),
}));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCaller,
  requireMinRole: (caller: any, min: string) => (min === "admin" ? ["admin", "owner"].includes(caller?.role) : true),
}));
vi.mock("@/lib/ai/automation/policy", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, loadAiAutomationSettings: mocks.loadSettings };
});
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

import { GET, PUT } from "@/app/api/admin/settings/ai-automation/route";

function req(body: unknown) {
  return new Request("http://localhost/x", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.loadSettings.mockResolvedValue({
    enabled: true,
    fieldPolicies: {},
    confidenceThreshold: 0.5,
    sourcePolicies: {},
    autoActions: {},
    loadedFromDb: true,
  });
});

describe("GET /api/admin/settings/ai-automation", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.resolveCaller.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns current settings + role", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "member",
      planTier: "standard",
    });
    mocks.loadSettings.mockResolvedValue({
      enabled: true,
      fieldPolicies: { "certificate.title": "auto" },
      confidenceThreshold: 0.7,
      sourcePolicies: { photos: false },
      loadedFromDb: true,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.confidenceThreshold).toBe(0.7);
    expect(body.settings.fieldPolicies["certificate.title"]).toBe("auto");
    expect(body.role).toBe("member");
    expect(body.loadedFromDb).toBe(true);
  });
});

describe("PUT /api/admin/settings/ai-automation", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.resolveCaller.mockResolvedValue(null);
    const res = await PUT(req({ enabled: false }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is below admin", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "member",
      planTier: "standard",
    });
    const res = await PUT(req({ enabled: false }));
    expect(res.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sanitizes unknown field keys before persisting", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    const res = await PUT(
      req({
        fieldPolicies: {
          "certificate.title": "auto",
          "ghost.field": "auto", // unknown key -> dropped by sanitizer
        },
        sourcePolicies: {
          photos: false,
          unknown_source: true, // unknown key -> dropped by sanitizer
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.fieldPolicies).toEqual({ "certificate.title": "auto" });
    expect(body.settings.sourcePolicies).toEqual({ photos: false });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects bad policy values at the zod boundary", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    const res = await PUT(
      req({
        fieldPolicies: { "certificate.title": "yolo" }, // not in enum
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed schema", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    const res = await PUT(req({ confidenceThreshold: 1.5 })); // out of [0,1]
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("soft-fails on missing table (persisted=false + warning)", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    mocks.upsert.mockResolvedValue({
      error: { code: "42P01", message: 'relation "tenant_ai_automation_settings" does not exist' },
    });
    const res = await PUT(req({ enabled: true, confidenceThreshold: 0.5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.warning).toMatch(/未作成/);
  });

  it("returns persisted=true after successful upsert", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    const res = await PUT(req({ enabled: false, confidenceThreshold: 0.3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(true);
    expect(body.settings.enabled).toBe(false);
    expect(body.settings.confidenceThreshold).toBe(0.3);
  });

  it("persists sanitized auto-actions, dropping unknown / false but keeping former Wall-3", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    const res = await PUT(
      req({
        autoActions: {
          "inbound_message.auto_extract": true,
          "certificate.auto_issue": true, // formerly Wall-3, now kept
          "ghost.action": true, // unknown -> dropped
          "review.auto_analyze": false, // false -> dropped
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.autoActions).toEqual({
      "inbound_message.auto_extract": true,
      "certificate.auto_issue": true,
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("allows Starter plan to enable auto-actions (AI opened to Starter)", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "starter",
    });
    const res = await PUT(req({ autoActions: { "inbound_message.auto_extract": true } }));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("blocks enabling auto-actions on Free plan (403, no write)", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "free",
    });
    const res = await PUT(req({ autoActions: { "inbound_message.auto_extract": true } }));
    expect(res.status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not plan-gate edits that touch only non-auto-action settings", async () => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "starter",
    });
    const res = await PUT(req({ confidenceThreshold: 0.6 }));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
