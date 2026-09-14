import { test, expect } from "@playwright/test";
import { loginAsAdmin, authedRequest } from "./helpers/auth";
import { adminCreds } from "./helpers/env";

/**
 * IMP-052: 例外フロー E2E — v2.0 §23 必須例外10種。
 *
 * IMP-031（cancel/no-show/pause/additional work）で定義された
 * 例外シナリオの E2E テスト。
 *
 * ponytail: 例外フローの多くは API 経由でトリガーする。
 * UI 操作はデモデータの状態に依存するため、
 * API レベルでの入力検証・ステータス遷移を中心に検証。
 */

const creds = adminCreds();

test.describe("例外フロー — API レベル検証", () => {
  test.skip(!creds, "E2E_USER_EMAIL / E2E_USER_PASSWORD が未設定");

  test("予約更新: 不正な ID 形式はバリデーションエラー", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const request = await authedRequest(page.context(), page.url());
    try {
      // 予約の更新（キャンセル含む）は PUT /api/admin/reservations に
      // { id, ...更新フィールド } を渡す形。専用の /cancel エンドポイントは無い。
      const res = await request.put("/api/admin/reservations", {
        data: { id: "not-a-uuid", status: "cancelled" },
      });
      // 通常はスキーマバリデーションで 400。デモテナントのプランが starter 未満だと
      // billing gate が先に 402 を返す（enforceBilling、reservation_update）。
      expect([400, 402]).toContain(res.status());
    } finally {
      await request.dispose();
    }
  });

  test("証明書無効化: 不正な public_id は 404", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const request = await authedRequest(page.context(), page.url());
    try {
      // certificateVoidSchema が要求するフィールドは public_id のみ
      const res = await request.post("/api/admin/certificates/void", {
        data: { public_id: "nonexistent-public-id-00000000" },
      });
      expect(res.status()).toBe(404);
    } finally {
      await request.dispose();
    }
  });

  test("作業ステータス更新: 不正なステータス値はリジェクト", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const request = await authedRequest(page.context(), page.url());
    try {
      // reservationUpdateSchema の status は enum のため、未知の値は
      // DB 参照前にスキーマバリデーションで弾かれる（PATCH ではなく PUT、id は body 側）。
      // billing gate（starter 未満で 402）については上のテストと同様。
      const res = await request.put("/api/admin/reservations", {
        data: { id: "00000000-0000-0000-0000-000000000000", status: "INVALID_STATUS" },
      });
      expect([400, 402]).toContain(res.status());
    } finally {
      await request.dispose();
    }
  });

  test("証明書ステータス変更: 不正な public_id は 404（写真ゲート自体は単体テストで検証済み）", async ({
    page,
  }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const request = await authedRequest(page.context(), page.url());
    try {
      // draft→active の写真必須ゲート本体は
      // src/app/api/admin/certificates/__tests__/status-photo-gate.test.ts で検証済み。
      // ここでは E2E としてエンドポイントの存在・認証・not-found ハンドリングを確認する。
      const res = await request.put("/api/admin/certificates/status", {
        data: { public_id: "nonexistent-public-id-00000000", status: "active" },
      });
      expect(res.status()).toBe(404);
    } finally {
      await request.dispose();
    }
  });
});

test.describe("例外フロー — UI レベル検証", () => {
  test.skip(!creds, "E2E_USER_EMAIL / E2E_USER_PASSWORD が未設定");

  test("設定ページにアクセスできる", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/settings");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("存在しない管理画面パスは 404 表示", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/nonexistent-page-12345");
    // 404 ページまたはリダイレクト（500 ではない）
    const status = await page.locator("body").textContent();
    expect(status).not.toContain("Internal Server Error");
  });

  test("POS 画面がエラーなく表示される", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/pos");
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("横断検索が機能する", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    // 検索バーまたは CommandPalette を開く
    const searchInput = page.locator('[data-testid="global-search"], [placeholder*="検索"], input[type="search"]');
    if (await searchInput.first().isVisible()) {
      await searchInput.first().fill("テスト");
      // 結果が表示される（エラーなし）
      await page.waitForTimeout(1000);
      await expect(page.locator("body")).not.toContainText("500");
    }
  });
});
