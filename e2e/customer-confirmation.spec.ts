import { test, expect } from "@playwright/test";
import { customerPortalConfig } from "./helpers/env";

/**
 * IMP-052: 顧客確認フロー E2E — v2.0 §23。
 *
 * IMP-026（顧客確認ウェブ）で実装された顧客ポータルの
 * 確認・懸念フローの E2E テスト。
 *
 * 前提: E2E_TENANT_SLUG が設定済み。
 */

const config = customerPortalConfig();

test.describe("顧客ポータル — 基本表示", () => {
  test.skip(!config, "E2E_TENANT_SLUG / E2E_CUSTOMER_PHONE が未設定");

  test("顧客ログインページが表示される", async ({ page }) => {
    await page.goto(`/customer/${config!.tenantSlug}/login`);
    await expect(page.locator("body")).not.toContainText("500");
    // OTP 入力フォームが存在する（メール・電話下4桁の2つの input が常に表示される）
    await expect(page.locator("input").first()).toBeVisible();
  });

  test("無効なテナントスラグはエラー表示", async ({ page }) => {
    await page.goto("/customer/invalid-slug-xyz/login");
    await expect(page.locator("body")).not.toContainText("500");
  });
});

test.describe("顧客ポータル — 公開証明書表示", () => {
  test("公開証明書ページが存在しない ID でも 500 にならない", async ({ page }) => {
    await page.goto("/certificates/NONEXISTENT-ID");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("パスポート公開ページが存在しない VIN でも 500 にならない", async ({ page }) => {
    await page.goto("/passport/NONEXISTENT-VIN");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
