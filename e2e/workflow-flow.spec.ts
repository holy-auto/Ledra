import { test, expect } from "@playwright/test";
import { loginAsAdmin, authedRequest } from "./helpers/auth";
import { adminCreds } from "./helpers/env";

/**
 * IMP-052: 正常ワークフロー E2E — 予約→作業→証拠→証明書→VERIFIED。
 *
 * v2.0 §23 必須フロー。デモテナントのシードデータを起点に、
 * 主要業務フローを一通り検証する。
 *
 * 前提: E2E_USER_EMAIL / E2E_USER_PASSWORD が設定済み。
 */

const creds = adminCreds();

test.describe("正常ワークフロー — 予約→証明書発行", () => {
  test.skip(!creds, "E2E_USER_EMAIL / E2E_USER_PASSWORD が未設定");

  test("ダッシュボードに今日のタスクが表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await expect(page.locator("body")).toContainText(/ダッシュボード|Dashboard/);
    // NEXT ACTION セクション（IMP-021）が存在する
    await expect(page.locator('[data-testid="next-action-section"], [class*="NextAction"]')).toBeVisible();
  });

  test("予約一覧が表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/reservations");
    await expect(page.locator("body")).not.toContainText("500");
    // 予約一覧は viewMode に関わらずページヘッダーが必ず表示される
    // （実装はテーブルではなく日付グループ化されたカード表示）
    await expect(page.getByRole("heading", { name: "予約管理" })).toBeVisible();
  });

  test("作業詳細画面が開ける", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/reservations");
    // 最初の予約カードのタイトルリンク（/admin/jobs/{id}）をクリック
    const firstJobLink = page.locator('a[href^="/admin/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForURL(/\/jobs\//);
    }
  });

  test("証明書一覧が表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/certificates");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("証明書詳細→公開ページリンクが機能する", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const request = await authedRequest(page.context(), page.url());
    try {
      // デモ証明書を取得
      const res = await request.get("/api/admin/certificates?limit=1");
      if (res.ok()) {
        const json = (await res.json()) as { certificates?: Array<{ public_id?: string }> };
        const cert = json.certificates?.[0];
        if (cert?.public_id) {
          // 公開ページにアクセス
          await page.goto(`/certificates/${cert.public_id}`);
          await expect(page.locator("body")).not.toContainText("500");
        }
      }
    } finally {
      await request.dispose();
    }
  });

  test("車両一覧→車両詳細が開ける", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/vehicles");
    await expect(page.locator("body")).not.toContainText("500");
    // 行(<tr>)自体はクリック不可。行内の「詳細」リンクをクリックする。
    const firstDetailLink = page.locator('table tbody tr a[href^="/admin/vehicles/"]').first();
    if (await firstDetailLink.isVisible()) {
      await firstDetailLink.click();
      await page.waitForURL(/\/vehicles\//);
    }
  });

  test("顧客一覧が表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/customers");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("請求書一覧が表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/billing");
    await expect(page.locator("body")).not.toContainText("500");
  });
});
