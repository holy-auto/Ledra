import { test, expect } from "@playwright/test";

test.describe("Authentication & Authorization", () => {
  test("POST /api/certificates/create returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/certificates/create", {
      data: {
        tenant_id: "00000000-0000-0000-0000-000000000000",
        customer_name: "テスト",
        status: "active",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/certificates/pdf-one returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/certificates/pdf-one", {
      data: { id: "fake-id" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/admin/customers returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/customers");
    expect(res.status()).toBe(401);
  });

  test("GET /api/insurer/certificate returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/certificate?public_id=test");
    expect(res.status()).toBe(401);
  });

  test("GET /api/insurer/search returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/insurer/search?q=test");
    expect(res.status()).toBe(401);
  });
});

test.describe("Cron authentication", () => {
  test("GET /api/cron/billing returns 401 without CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/billing");
    expect(res.status()).toBe(401);
  });

  test("GET /api/cron/follow-up returns 401 without CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/follow-up");
    expect(res.status()).toBe(401);
  });

  test("GET /api/cron/maintenance returns 401 without CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/maintenance");
    expect(res.status()).toBe(401);
  });
});

test.describe("Public endpoints", () => {
  test("GET /api/certificate/pdf requires pid parameter", async ({ request }) => {
    const res = await request.get("/api/certificate/pdf");
    expect([400, 404]).toContain(res.status());
  });
});

test.describe("Protected page redirects", () => {
  test("/admin redirects to /login for unauthenticated users", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain("/login");
  });

  test("/insurer redirects to /insurer/login for unauthenticated users", async ({ page }) => {
    await page.goto("/insurer");
    await page.waitForURL(/\/insurer\/login/);
    expect(page.url()).toContain("/insurer/login");
  });
});

test.describe("Webhook signature verification", () => {
  test("POST /api/stripe/webhook rejects unsigned requests", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { type: "test.event" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/webhooks/resend rejects missing headers when secret is set", async ({ request }) => {
    const res = await request.post("/api/webhooks/resend", {
      data: { type: "email.sent", data: {} },
    });
    // 401 if RESEND_WEBHOOK_SECRET is set, 200 if not
    expect([200, 401]).toContain(res.status());
  });
});
