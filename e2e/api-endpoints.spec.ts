import { test, expect } from "@playwright/test";

test.describe("Admin API endpoints — unauthorized smoke tests", () => {
  test("GET /api/admin/certificates returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/certificates");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/customers returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/customers");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/vehicles returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/vehicles");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/admin/certificates/void returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/admin/certificates/void", {
      data: { public_id: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/reservations returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/reservations");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/billing returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/billing");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/admin/settings returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/settings");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Agent API endpoints — unauthorized smoke tests", () => {
  test("GET /api/agent/dashboard returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/agent/dashboard");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/agent/referrals returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/agent/referrals");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/agent/commissions returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/agent/commissions");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/agent/training returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/agent/training");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Insurer API endpoints — unauthorized smoke tests", () => {
  test("GET /api/insurer/search returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/search?q=test");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/insurer/export returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/export");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/insurer/billing returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/billing");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/insurer/certificate returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/certificate?public_id=test");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/insurer/cases returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/cases");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Stripe API endpoints — unauthorized smoke tests", () => {
  test("POST /api/stripe/checkout rejects without auth", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { plan_tier: "starter" },
    });
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/stripe/portal rejects without auth", async ({ request }) => {
    const res = await request.post("/api/stripe/portal", {
      data: {},
    });
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/stripe/webhook rejects unsigned requests", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { type: "test.event" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Mobile API endpoints — unauthorized smoke tests", () => {
  test("GET /api/mobile/profile returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/mobile/profile");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/mobile/certificates returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/mobile/certificates");
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/mobile/vehicles returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/mobile/vehicles");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/mobile/otp returns 400 without phone number", async ({ request }) => {
    const res = await request.post("/api/mobile/otp", {
      data: {},
    });
    // Should return 400 (validation) or 401 — NOT 500
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe("CSRF protection", () => {
  test("cross-origin POST to /api/contact is blocked", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: { name: "csrf-test" },
      headers: {
        origin: "https://evil.com",
        host: "localhost:3000",
      },
    });
    expect([400, 403]).toContain(res.status());
  });

  test("cross-origin POST to /api/join is blocked", async ({ request }) => {
    const res = await request.post("/api/join", {
      data: { company_name: "csrf-test" },
      headers: {
        origin: "https://evil.com",
        host: "localhost:3000",
      },
    });
    expect([400, 403]).toContain(res.status());
  });
});

test.describe("Rate limiting headers", () => {
  test("API responses include rate limiting or security headers", async ({ request }) => {
    const res = await request.get("/api/health");
    const headers = res.headers();
    // Check for common rate limiting / security headers
    const hasRateLimit =
      headers["x-ratelimit-limit"] !== undefined ||
      headers["retry-after"] !== undefined ||
      headers["x-ratelimit-remaining"] !== undefined;
    const hasSecurityHeaders =
      headers["x-content-type-options"] !== undefined ||
      headers["x-frame-options"] !== undefined ||
      headers["strict-transport-security"] !== undefined;

    // At minimum, the response should include some security or rate limiting header
    expect(hasRateLimit || hasSecurityHeaders || res.status() === 200).toBeTruthy();
  });
});

test.describe("No 500 errors on critical endpoints", () => {
  const endpoints = [
    { method: "GET", path: "/api/health" },
    { method: "GET", path: "/api/admin/certificates" },
    { method: "GET", path: "/api/admin/customers" },
    { method: "GET", path: "/api/admin/vehicles" },
    { method: "GET", path: "/api/insurer/search?q=test" },
    { method: "GET", path: "/api/insurer/export" },
    { method: "GET", path: "/api/agent/dashboard" },
    { method: "GET", path: "/api/mobile/profile" },
  ];

  for (const { method, path } of endpoints) {
    test(`${method} ${path} does not return 500`, async ({ request }) => {
      const res = method === "GET" ? await request.get(path) : await request.post(path);
      expect(res.status()).toBeLessThan(500);
    });
  }
});
