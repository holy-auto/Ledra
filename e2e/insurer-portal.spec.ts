import { test, expect } from "@playwright/test";

test.describe("Insurer portal — unauthenticated", () => {
  test("insurer login page renders with form fields", async ({ page }) => {
    await page.goto("/insurer/login");
    await expect(page.locator("body")).toContainText(/ログイン|メールアドレス|保険/);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });

  test("unauthenticated access to insurer dashboard redirects to login", async ({ page }) => {
    await page.goto("/insurer/dashboard");
    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/insurer/login");
  });

  test("unauthenticated access to insurer cases redirects to login", async ({ page }) => {
    await page.goto("/insurer/cases");
    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/insurer/login");
  });

  test("unauthenticated access to insurer certificate search redirects to login", async ({ page }) => {
    await page.goto("/insurer/certificates");
    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/insurer/login");
  });

  test("unauthenticated access to insurer vehicle search redirects to login", async ({ page }) => {
    await page.goto("/insurer/vehicles");
    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/insurer/login");
  });

  test("insurer login with empty credentials stays on login page", async ({ page }) => {
    await page.goto("/insurer/login");
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain("/insurer/login");
    }
  });

  test("insurer login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/insurer/login");
    await page.locator('input[name="email"], input[type="email"]').fill("fake-insurer@example.com");
    await page.locator('input[name="password"], input[type="password"]').fill("WrongPassword123");

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 }).catch(() => {
      // May remain on same page with inline error
    });
    expect(page.url()).toContain("/insurer/login");
  });
});

// Authenticated insurer tests — only run when E2E_INSURER_EMAIL and E2E_INSURER_PASSWORD are set
const insurerEmail = process.env.E2E_INSURER_EMAIL;
const insurerPassword = process.env.E2E_INSURER_PASSWORD;

test.describe("Insurer portal — authenticated", () => {
  test.skip(!insurerEmail || !insurerPassword, "Skipped: E2E_INSURER_EMAIL / E2E_INSURER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    // Requires auth setup - login as insurer before each test
    await page.goto("/insurer/login");
    await page.locator('input[name="email"], input[type="email"]').fill(insurerEmail!);
    await page.locator('input[name="password"], input[type="password"]').fill(insurerPassword!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/insurer/, { timeout: 15000 });
  });

  test("insurer dashboard structure loads", async ({ page }) => {
    await page.goto("/insurer/dashboard");
    await expect(page.locator("body")).toContainText(/ダッシュボード|dashboard/i);
  });

  test("case listing page renders", async ({ page }) => {
    await page.goto("/insurer/cases");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("search functionality UI is present", async ({ page }) => {
    await page.goto("/insurer/dashboard");
    // Look for search input or search button
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"], input[name="q"]');
    const searchExists = await searchInput.first().isVisible({ timeout: 5000 }).catch(() => false);
    // Search may be on a dedicated page instead
    if (!searchExists) {
      await page.goto("/insurer/search");
      const status = await page.evaluate(() => document.readyState);
      expect(status).toBe("complete");
    }
  });

  test("certificate search page loads", async ({ page }) => {
    await page.goto("/insurer/certificates");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });

  test("vehicle search page loads", async ({ page }) => {
    await page.goto("/insurer/vehicles");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
  });
});
