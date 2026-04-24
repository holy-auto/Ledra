import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: vi.fn(() => mockSupabase),
  createTenantScopedAdmin: vi.fn((tenantId: string) => ({ admin: mockSupabase, tenantId })),
  createInsurerScopedAdmin: vi.fn((insurerId: string) => ({ admin: mockSupabase, insurerId })),
}));

vi.mock("@/lib/auth/platformAdmin", () => ({
  isPlatformTenantId: vi.fn((id: string) => id === "platform-tenant-id"),
}));

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      subscriptions: {
        retrieve: vi.fn(),
      },
    })),
  };
});

// Build a chainable Supabase mock
function buildMockQuery(result: { data: any; error: any }) {
  const chain: any = {};
  const methods = ["from", "select", "eq", "in", "limit", "maybeSingle", "update", "insert", "order"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // The terminal call returns the result
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  // Make it thenable for await
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return chain;
}

let mockSupabase: any;
let mockTenantResult: { data: any; error: any };

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx");
  vi.stubEnv("BILLING_GRACE_DAYS", "14");

  mockTenantResult = {
    data: { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_123" },
    error: null,
  };

  mockSupabase = buildMockQuery(mockTenantResult);
});

import { enforceBilling } from "../guard";

function makeRequest(url: string, opts?: RequestInit): Request {
  return new Request(url, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
}

// ─── Feature gate / plan restriction tests ───
describe("enforceBilling — plan restriction", () => {
  it("returns null (allow) when tenant meets minimum plan", async () => {
    mockTenantResult.data = { plan_tier: "standard", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "starter" });
    expect(res).toBeNull();
  });

  it("returns null when plan exactly matches minPlan", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "starter" });
    expect(res).toBeNull();
  });

  it("blocks with 403 when plan is below minPlan (API request)", async () => {
    mockTenantResult.data = { plan_tier: "free", is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "standard" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("Plan restricted");
    expect(body.current_plan).toBe("free");
  });

  it("redirects with 303 for navigation request when plan insufficient", async () => {
    mockTenantResult.data = { plan_tier: "free", is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/admin/feature?tenant_id=t1", {
      headers: { accept: "text/html", "sec-fetch-mode": "navigate" },
    });
    const res = await enforceBilling(req, { minPlan: "pro" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(303);
    expect(res!.headers.get("Location")).toContain("/admin/billing");
  });
});

// ─── Missing tenant_id ───
describe("enforceBilling — missing tenant", () => {
  it("returns 400 when no tenant_id can be resolved", async () => {
    const req = makeRequest("https://app.test/api/cert");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toContain("Missing tenant_id");
  });
});

// ─── Tenant not found in DB ───
describe("enforceBilling — tenant not found", () => {
  it("returns 404 when tenant does not exist", async () => {
    mockTenantResult.data = null;
    mockTenantResult.error = { message: "not found" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=nonexistent");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });
});

// ─── Platform admin bypass ───
describe("enforceBilling — platform admin bypass", () => {
  it("returns null for platform tenant regardless of plan", async () => {
    const req = makeRequest("https://app.test/api/cert?tenant_id=platform-tenant-id");
    const res = await enforceBilling(req, { minPlan: "pro" });
    expect(res).toBeNull();
  });
});

// ─── Inactive billing ───
describe("enforceBilling — inactive billing", () => {
  it("returns 402 for inactive tenant (API request)", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: false, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
    const body = await res!.json();
    expect(body.error).toBe("Billing inactive");
    expect(body.billing_url).toBe("/admin/billing");
  });

  it("redirects inactive tenant for navigation requests", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: false, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/admin/page?tenant_id=t1", {
      headers: { accept: "text/html", "sec-fetch-mode": "navigate" },
    });
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(303);
  });
});

// ─── Default minPlan ───
describe("enforceBilling — default options", () => {
  it("defaults minPlan to free so any active plan passes", async () => {
    mockTenantResult.data = { plan_tier: "free", is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req);
    expect(res).toBeNull();
  });
});

// ─── Plan tier hierarchy ───
describe("enforceBilling — plan tier hierarchy", () => {
  it("pro plan passes all minPlan levels", async () => {
    mockTenantResult.data = { plan_tier: "pro", is_active: true, stripe_subscription_id: "sub_1" };
    for (const minPlan of ["free", "starter", "standard", "pro"] as const) {
      const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
      const res = await enforceBilling(req, { minPlan });
      expect(res).toBeNull();
    }
  });

  it("starter plan fails for standard minPlan", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "standard" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("starter plan fails for pro minPlan", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "pro" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("standard plan passes for starter minPlan", async () => {
    mockTenantResult.data = { plan_tier: "standard", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "starter" });
    expect(res).toBeNull();
  });
});

// ─── Tenant ID extraction from various sources ───
describe("enforceBilling — tenant ID extraction", () => {
  it("extracts tenant_id from tenantId query param", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenantId=t1");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).toBeNull();
  });

  it("extracts tenant_id from tenant query param", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: true, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant=t1");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).toBeNull();
  });
});

// ─── Response headers ───
describe("enforceBilling — response headers", () => {
  it("includes x-billing-url header on 402 response", async () => {
    mockTenantResult.data = { plan_tier: "starter", is_active: false, stripe_subscription_id: "sub_1" };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).not.toBeNull();
    expect(res!.headers.get("x-billing-url")).toBe("/admin/billing");
  });

  it("includes x-billing-url header on 403 plan restricted response", async () => {
    mockTenantResult.data = { plan_tier: "free", is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "pro" });
    expect(res).not.toBeNull();
    expect(res!.headers.get("x-billing-url")).toBe("/admin/billing");
  });

  it("includes action in plan restricted response body", async () => {
    mockTenantResult.data = { plan_tier: "free", is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "pro", action: "export_csv" });
    expect(res).not.toBeNull();
    const body = await res!.json();
    expect(body.action).toBe("export_csv");
  });
});

// ─── Null plan_tier defaults to free ───
describe("enforceBilling — null plan_tier", () => {
  it("treats null plan_tier as free", async () => {
    mockTenantResult.data = { plan_tier: null, is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "starter" });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("null plan_tier passes for free minPlan", async () => {
    mockTenantResult.data = { plan_tier: null, is_active: true, stripe_subscription_id: null };
    const req = makeRequest("https://app.test/api/cert?tenant_id=t1");
    const res = await enforceBilling(req, { minPlan: "free" });
    expect(res).toBeNull();
  });
});
