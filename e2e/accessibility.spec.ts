import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { adminCreds } from "./helpers/env";
import { checkA11y, isAxeAvailable } from "./helpers/a11y";

/**
 * IMP-052: アクセシビリティ E2E — WCAG 2.1 AA。
 *
 * IMP-051 の COMPONENT_ARIA_MAP / contrastCheck を補完する
 * ランタイム側の axe-core 検証。
 *
 * 前提: @axe-core/playwright がインストール済み。
 * 未インストール時は全テストスキップ。
 */

const creds = adminCreds();

test.describe("WCAG AA — 公開ページ", () => {
  test.skip(!isAxeAvailable(), "@axe-core/playwright 未インストール");

  test("ホームページに critical な違反がない", async ({ page }) => {
    await page.goto("/");
    const violations = await checkA11y(page);
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("ログインページに critical な違反がない", async ({ page }) => {
    await page.goto("/login");
    const violations = await checkA11y(page);
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("料金ページに critical な違反がない", async ({ page }) => {
    await page.goto("/pricing");
    const violations = await checkA11y(page);
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("お問い合わせページに critical な違反がない", async ({ page }) => {
    await page.goto("/contact");
    const violations = await checkA11y(page);
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});

test.describe("WCAG AA — 管理画面", () => {
  test.skip(!isAxeAvailable(), "@axe-core/playwright 未インストール");
  test.skip(!creds, "E2E_USER_EMAIL / E2E_USER_PASSWORD が未設定");

  test("ダッシュボードに critical な違反がない", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    const violations = await checkA11y(page, {
      // ponytail: サードパーティ埋め込み（チャット等）を除外
      exclude: ["[data-testid='chat-widget']", "iframe"],
    });
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("予約一覧に critical な違反がない", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/reservations");
    const violations = await checkA11y(page, { exclude: ["iframe"] });
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("証明書一覧に critical な違反がない", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/certificates");
    const violations = await checkA11y(page, { exclude: ["iframe"] });
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("設定ページに critical な違反がない", async ({ page }) => {
    await loginAsAdmin(page, creds!.email, creds!.password);
    await page.goto("/admin/settings");
    const violations = await checkA11y(page, { exclude: ["iframe"] });
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});

test.describe("WCAG AA — 全違反レポート（情報提供）", () => {
  test.skip(!isAxeAvailable(), "@axe-core/playwright 未インストール");

  test("ホームページの全 a11y 違反をレポート", async ({ page }) => {
    await page.goto("/");
    const violations = await checkA11y(page);
    // ponytail: serious/moderate は警告として記録。CI を止めるのは critical のみ。
    if (violations.length > 0) {
      console.log(
        "a11y violations on /:",
        violations.map((v) => `${v.impact}: ${v.id} (${v.nodes} nodes)`),
      );
    }
    // critical のみ失敗
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});
