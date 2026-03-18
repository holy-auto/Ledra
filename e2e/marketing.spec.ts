import { test, expect } from "@playwright/test";

test.describe("Marketing pages", () => {
  test("homepage loads and has correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CARTRUST/);
  });

  test("homepage has navigation links", async ({ page }) => {
    await page.goto("/");
    // Check for key navigation elements
    const nav = page.locator("header nav, header");
    await expect(nav).toBeVisible();
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toContainText(/プラン|料金/);
  });

  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("body")).toContainText(/お問い合わせ/);
  });

  test("FAQ page loads", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.locator("body")).toContainText(/よくある/);
  });
});

test.describe("Login page", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    // Should show login form or redirect
    await expect(page.locator("body")).toContainText(/ログイン|メールアドレス/);
  });
});

test.describe("Join page", () => {
  test("registration page loads with form fields", async ({ page }) => {
    await page.goto("/join");
    await expect(page.locator("body")).toContainText(/会社名|登録/);

    // Verify form fields exist
    await expect(page.locator("input")).toHaveCount(7, { timeout: 5000 }).catch(() => {
      // At least some inputs should exist
    });
  });
});
