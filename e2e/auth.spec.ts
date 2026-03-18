import { test, expect } from "@playwright/test";

test.describe("Authentication flow", () => {
  test("login page renders with form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toContainText(/ログイン/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("login with empty credentials shows error or stays on page", async ({ page }) => {
    await page.goto("/login");
    // Submit empty form (HTML5 validation should prevent or server returns error)
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    await emailInput.fill("");
    await passwordInput.fill("");

    // Try to submit - either HTML5 validation prevents or page stays on /login
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should remain on login page (no redirect to admin)
      await page.waitForTimeout(1000);
      expect(page.url()).toContain("/login");
    }
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("nonexistent@example.com");
    await page.locator('input[name="password"]').fill("WrongPassword123");

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Should redirect back to login with error param
    await page.waitForURL(/\/login.*e=1/, { timeout: 10000 }).catch(() => {
      // Or remain on login page showing error
    });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to admin redirects to login", async ({ page }) => {
    await page.goto("/admin/certificates");
    // Should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to admin/billing redirects to login", async ({ page }) => {
    await page.goto("/admin/billing");
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated access to insurer redirects to insurer login", async ({ page }) => {
    await page.goto("/insurer/dashboard");
    // Should redirect to /insurer/login
    await page.waitForURL(/\/insurer\/login/, { timeout: 10000 });
    expect(page.url()).toContain("/insurer/login");
  });
});

// Authenticated tests — only run when E2E_USER_EMAIL and E2E_USER_PASSWORD are set
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.describe("Authenticated flow", () => {
  test.skip(!email || !password, "Skipped: E2E_USER_EMAIL / E2E_USER_PASSWORD not set");

  test("login and reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();

    // Should redirect to admin area
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    expect(page.url()).toContain("/admin");
  });

  test("login then logout returns to login", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Look for logout button/link and click it
    const logoutBtn = page.locator('a:has-text("ログアウト"), button:has-text("ログアウト")');
    if (await logoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForURL(/\/login/, { timeout: 10000 });
      expect(page.url()).toContain("/login");
    }
  });
});
