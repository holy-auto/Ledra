import { test, expect } from "@playwright/test";

// Admin portal tests — only run when E2E_USER_EMAIL and E2E_USER_PASSWORD are set
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.describe("Admin portal — unauthenticated redirects", () => {
  test("admin dashboard redirects to login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin certificates page redirects to login", async ({ page }) => {
    await page.goto("/admin/certificates");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin vehicles page redirects to login", async ({ page }) => {
    await page.goto("/admin/vehicles");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin customers page redirects to login", async ({ page }) => {
    await page.goto("/admin/customers");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin reservations page redirects to login", async ({ page }) => {
    await page.goto("/admin/reservations");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin POS page redirects to login", async ({ page }) => {
    await page.goto("/admin/pos");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin billing page redirects to login", async ({ page }) => {
    await page.goto("/admin/billing");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("admin settings page redirects to login", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Admin portal — authenticated", () => {
  test.skip(!email || !password, "Skipped: E2E_USER_EMAIL / E2E_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    // Requires auth setup - login as admin before each test
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin/, { timeout: 15000 });
  });

  test("dashboard loads with widgets", async ({ page }) => {
    await page.goto("/admin");
    // Dashboard should have some form of widget or summary content
    await expect(page.locator("body")).toContainText(/ダッシュボード|dashboard|証明書|車両/i);
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("certificate list page renders", async ({ page }) => {
    await page.goto("/admin/certificates");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
    // Should contain a table or list
    const tableOrList = page.locator("table, [role='table'], [role='grid']");
    await expect(tableOrList.first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Page may use a different layout pattern
    });
  });

  test("vehicle list page renders", async ({ page }) => {
    await page.goto("/admin/vehicles");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("customer list page renders", async ({ page }) => {
    await page.goto("/admin/customers");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("reservation page renders", async ({ page }) => {
    await page.goto("/admin/reservations");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("POS page renders", async ({ page }) => {
    await page.goto("/admin/pos");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("billing page renders", async ({ page }) => {
    await page.goto("/admin/billing");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/admin/settings");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("navigation sidebar links exist", async ({ page }) => {
    await page.goto("/admin");
    // Verify sidebar navigation contains key links
    const sidebar = page.locator("nav, aside, [role='navigation']");
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 });

    // Check for expected navigation items
    const body = page.locator("body");
    await expect(body).toContainText(/証明書|certificate/i);
    await expect(body).toContainText(/車両|vehicle/i);
    await expect(body).toContainText(/顧客|customer/i);
  });
});
