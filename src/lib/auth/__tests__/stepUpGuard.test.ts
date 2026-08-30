import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAal2OrResponse, requiresAal2ForRequest } from "../stepUpGuard";

describe("requiresAal2ForRequest", () => {
  it.each([
    ["/api/admin/platform/tenants", "GET"],
    ["/api/admin/platform/tenant-action", "POST"],
    ["/api/admin/agent-applications/id", "PATCH"],
    ["/api/admin/insurers", "GET"],
    ["/api/admin/data-export", "GET"],
    ["/api/agent/data-export", "GET"],
    ["/api/insurer/data-export", "GET"],
    ["/api/agent/supply/webhook-secret", "POST"],
    ["/api/agent/supply/profile", "PUT"],
    ["/api/admin/tenant/external-api-key", "POST"],
    ["/api/admin/gcal", "POST"],
    ["/api/admin/gcal/callback", "GET"],
    ["/api/admin/connect/slack/callback", "GET"],
  ])("protects %s %s", (path, method) => {
    expect(requiresAal2ForRequest(path, method)).toBe(true);
  });

  it.each([
    ["/api/admin/gcal", "GET"],
    ["/api/admin/line-knowledge", "POST"],
    ["/api/admin/customers", "GET"],
  ])("does not over-match %s %s", (path, method) => {
    expect(requiresAal2ForRequest(path, method)).toBe(false);
  });
});

describe("requireAal2OrResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows an aal2 session", async () => {
    const supabase = {
      auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal2" } }) } },
    };
    expect(await requireAal2OrResponse(supabase as never)).toBeNull();
  });

  it("fails closed for aal1", async () => {
    const supabase = {
      auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1" } }) } },
    };
    const response = await requireAal2OrResponse(supabase as never);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ error: "step_up_required" });
  });
});
