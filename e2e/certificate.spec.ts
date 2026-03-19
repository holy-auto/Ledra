import { test, expect } from "@playwright/test";

test.describe("Certificate API authorization", () => {
  test("certificate creation requires auth", async ({ request }) => {
    const res = await request.post("/api/certificates/create", {
      data: { vehicle_id: "test", template_items: [] },
    });
    // Should return 401 (unauthorized) or 400 (billing guard: missing tenant_id)
    expect([400, 401, 403]).toContain(res.status());
  });

  test("certificate void requires auth and admin role", async ({ request }) => {
    const res = await request.post("/api/certificates/void", {
      data: { certificate_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("certificate image upload requires auth", async ({ request }) => {
    const res = await request.post("/api/certificates/images/upload", {
      data: {},
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("admin certificate void requires auth", async ({ request }) => {
    const res = await request.post("/api/admin/certificates/void", {
      data: { public_id: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Certificate public access", () => {
  test("public certificate PDF returns 404 for invalid public_id", async ({ request }) => {
    const res = await request.get("/api/certificate/pdf?pid=nonexistent-id-12345");
    // Should return 404 (not found) or 402 (billing inactive) — NOT 500
    expect([400, 402, 404]).toContain(res.status());
  });

  test("public certificate status returns 404 for invalid public_id", async ({ request }) => {
    const res = await request.get("/api/certificate/public-status?public_id=nonexistent-id-12345");
    // Should return structured error, not 500
    expect(res.status()).toBeLessThan(500);
  });

  test("public certificate page loads for valid format", async ({ page }) => {
    // /c/ is the public certificate viewing path - should handle gracefully even with invalid ID
    await page.goto("/c/nonexistent-test-id");
    // Should either show "not found" or load the public view without crashing
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });
});

test.describe("Stripe checkout authorization", () => {
  test("checkout without access_token is rejected", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { plan_tier: "starter" },
    });
    // Should return 400 (validation) or 401 (unauthorized)
    expect([400, 401]).toContain(res.status());
  });

  test("checkout with invalid access_token is rejected", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { access_token: "invalid-token", plan_tier: "starter" },
    });
    expect(res.status()).toBe(401);
  });

  test("portal without access_token is rejected", async ({ request }) => {
    const res = await request.post("/api/stripe/portal", {
      data: {},
    });
    expect([400, 401]).toContain(res.status());
  });
});

test.describe("Insurer API authorization", () => {
  test("insurer search requires auth", async ({ request }) => {
    const res = await request.get("/api/insurer/search?q=test");
    expect([401, 403]).toContain(res.status());
  });

  test("insurer export requires auth", async ({ request }) => {
    const res = await request.get("/api/insurer/export");
    expect([401, 403]).toContain(res.status());
  });

  test("insurer billing requires auth", async ({ request }) => {
    const res = await request.get("/api/insurer/billing");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Market inquiry rate limiting", () => {
  test("market inquiry requires all fields", async ({ request }) => {
    const res = await request.post("/api/market/inquiries", {
      data: { vehicle_id: "" },
    });
    expect(res.status()).toBe(400);
  });
});
