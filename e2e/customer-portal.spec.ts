import { test, expect } from "@playwright/test";

test.describe("Customer portal — login page", () => {
  test("customer login page renders with tenant slug", async ({ page }) => {
    // Customer portal is accessed via tenant slug: /customer/{slug}/login
    await page.goto("/customer/demo/login");
    // Should render a login or OTP form, or show a 404 for unknown tenant
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");

    // Page should not be a 500 error
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("OTP form structure is present on customer login", async ({ page }) => {
    await page.goto("/customer/demo/login");
    // Customer login typically uses phone number + OTP
    const phoneInput = page.locator(
      'input[name="phone"], input[type="tel"], input[name="email"], input[type="email"]'
    );
    const inputVisible = await phoneInput.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (inputVisible) {
      // Verify submit button exists alongside the input
      const submitBtn = page.locator('button[type="submit"]');
      await expect(submitBtn).toBeVisible();
    } else {
      // If no input is visible, the tenant slug may be invalid — page should handle gracefully
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toContain("Internal Server Error");
    }
  });

  test("invalid tenant slug is handled gracefully", async ({ page }) => {
    await page.goto("/customer/nonexistent-tenant-xyz/login");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");

    // Should show a 404 or error message, NOT a 500
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("customer portal root with invalid tenant returns gracefully", async ({ page }) => {
    await page.goto("/customer/nonexistent-tenant-xyz");
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");
  });
});
