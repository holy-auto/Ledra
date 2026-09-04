/**
 * Playwright screenshot capture for Ledra onboarding videos.
 * Run after `next dev` is serving on E2E_BASE_URL (default: http://localhost:3000).
 *
 * Outputs to public/screenshots/{admin,insurer,agent}/
 *
 * Usage:
 *   npx tsx scripts/capture-screenshots.ts
 */
import { chromium, Page } from "playwright";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.E2E_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";

// Defaults match the seed scripts (setup-demo-tenant-user / setup-demo-insurer /
// setup-demo-agent). Without these fallbacks, missing CI secrets caused entire
// portals to silently skip and slides rendered as 📸 placeholders.
const ADMIN_EMAIL      = process.env.DEMO_ADMIN_EMAIL    || "demo@ledra-motors.example";
const ADMIN_PASSWORD   = process.env.DEMO_ADMIN_PASSWORD || "Demo1234!";
const INSURER_EMAIL    = process.env.DEMO_INSURER_EMAIL    || "demo@insurer.ledra.test";
const INSURER_PASSWORD = process.env.DEMO_INSURER_PASSWORD || "Demo1234!";
const AGENT_EMAIL      = process.env.DEMO_AGENT_EMAIL    || "demo@agent.ledra.test";
const AGENT_PASSWORD   = process.env.DEMO_AGENT_PASSWORD || "Demo1234!";

const OUT = path.join(process.cwd(), "public", "screenshots");

// Login button has no explicit type="submit" attribute on any portal (admin uses
// form-default submit, insurer/agent use onClick). CSS attribute selectors don't
// match implicit defaults, so we fall back to text + class.
const LOGIN_BUTTON =
  'button[type="submit"], form button.btn-primary, button.btn-primary:has-text("ログイン")';

// Agent login email input has neither name nor type="email" — match by type or
// by being the only non-password input in the form.
const EMAIL_INPUT  = 'input[name="email"], input[type="email"], input[placeholder*="email"]';
const PASSWORD_INPUT = 'input[name="password"], input[type="password"]';

async function go(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
}

async function shot(page: Page, file: string) {
  const dest = path.join(OUT, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await page.screenshot({ path: dest, fullPage: false });
  console.log("✓", file);
}

async function login(page: Page, email: string, password: string, loginPath: string) {
  // Resolve email input: prefer name/type matchers, fall back to first non-password
  // input on the page (covers agent login which has neither name nor type="email").
  const emailLocator = page.locator(EMAIL_INPUT).first();
  if ((await emailLocator.count()) > 0) {
    await emailLocator.fill(email);
  } else {
    await page
      .locator('input:not([type="password"]):not([type="hidden"]):not([type="submit"])')
      .first()
      .fill(email);
  }
  await page.locator(PASSWORD_INPUT).first().fill(password);

  const submit = page.locator(LOGIN_BUTTON).first();
  if ((await submit.count()) === 0) {
    throw new Error(`Login button not found on ${loginPath}`);
  }
  await submit.click();

  // Wait until we leave the login page (redirect destination varies per portal).
  try {
    await page.waitForFunction(
      (p: string) => !window.location.pathname.startsWith(p),
      loginPath,
      { timeout: 25000 },
    );
  } catch {
    // Capture a debug screenshot so we can see what state the page is in
    // (often: empty form, validation error, or stuck on a spinner).
    const debugPath = path.join(OUT, `_debug-login-${loginPath.replace(/\//g, "_")}.png`);
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    const url = page.url();
    throw new Error(
      `Login redirect timed out on ${loginPath} (current URL: ${url}). Debug shot: ${debugPath}`,
    );
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

async function captureAdmin(browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Login page (pre-auth)
  await go(page, `${BASE_URL}/login`);
  await shot(page, "admin/login.png");

  // Authenticate
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/login");

  // Dashboard
  await go(page, `${BASE_URL}/admin`);
  await shot(page, "admin/dashboard.png");

  // Certificates list
  await go(page, `${BASE_URL}/admin/certificates`);
  await shot(page, "admin/certs-list.png");

  // New-certificate form. Navigate straight to the route: matching a button by
  // text picked up the "新規登録" (tenant signup) link in the shell instead —
  // "新規登録" contains "新規" — so both certs-new and vehicles-new silently
  // captured the signup page, and the PDF shipped it under the caption
  // "証明書の新規発行".
  await go(page, `${BASE_URL}/admin/certificates/new`);
  await shot(page, "admin/certs-new.png");

  // Vehicles list
  await go(page, `${BASE_URL}/admin/vehicles`);
  await shot(page, "admin/vehicles-list.png");

  // New-vehicle form — same text-matching trap as certs-new above.
  await go(page, `${BASE_URL}/admin/vehicles/new`);
  await shot(page, "admin/vehicles-new.png");

  // Customers
  await go(page, `${BASE_URL}/admin/customers`);
  await shot(page, "admin/customers-list.png");

  // Try clicking first customer row for detail
  const firstCustomer = page.locator("table tbody tr, [data-testid='customer-row'], .customer-row").first();
  if ((await firstCustomer.count()) > 0) {
    await firstCustomer.click();
    await page.waitForTimeout(800);
    await shot(page, "admin/customers-detail.png");
    await page.goBack();
    await page.waitForTimeout(500);
  } else {
    fs.copyFileSync(path.join(OUT, "admin/customers-list.png"), path.join(OUT, "admin/customers-detail.png"));
  }

  // Reservations
  await go(page, `${BASE_URL}/admin/reservations`);
  await shot(page, "admin/reservations.png");

  // POS
  await go(page, `${BASE_URL}/admin/pos`);
  await shot(page, "admin/pos.png");

  // Billing
  await go(page, `${BASE_URL}/admin/billing`);
  await shot(page, "admin/billing.png");

  // Settings (general)
  await go(page, `${BASE_URL}/admin/settings`);
  await shot(page, "admin/settings.png");

  // Try members/team sub-page
  const membersLink = page.locator('a:has-text("メンバー"), a:has-text("チーム"), a:has-text("Members"), a:has-text("Team")').first();
  if ((await membersLink.count()) > 0) {
    await membersLink.click();
    await page.waitForTimeout(800);
    await shot(page, "admin/settings-members.png");
  } else {
    fs.copyFileSync(path.join(OUT, "admin/settings.png"), path.join(OUT, "admin/settings-members.png"));
  }

  await ctx.close();
}

async function captureInsurer(browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Login page
  await go(page, `${BASE_URL}/insurer/login`);
  await shot(page, "insurer/login.png");

  // Authenticate
  await login(page, INSURER_EMAIL, INSURER_PASSWORD, "/insurer/login");

  // Dashboard
  await shot(page, "insurer/dashboard.png");

  // Search
  await go(page, `${BASE_URL}/insurer/search`);
  await shot(page, "insurer/search.png");

  // Certificates
  await go(page, `${BASE_URL}/insurer/certificates`);
  await shot(page, "insurer/certs.png");

  // Try clicking first certificate for detail
  const firstCert = page.locator("table tbody tr, [data-testid='cert-row']").first();
  if ((await firstCert.count()) > 0) {
    await firstCert.click();
    await page.waitForTimeout(800);
    await shot(page, "insurer/cert-detail.png");
    await page.goBack();
    await page.waitForTimeout(500);
  } else {
    fs.copyFileSync(path.join(OUT, "insurer/certs.png"), path.join(OUT, "insurer/cert-detail.png"));
  }

  // Vehicles
  await go(page, `${BASE_URL}/insurer/vehicles`);
  await shot(page, "insurer/vehicles.png");

  // Cases
  await go(page, `${BASE_URL}/insurer/cases`);
  await shot(page, "insurer/cases.png");

  // Try new case form
  const newCaseBtn = page.locator(
    'button:has-text("新規"), button:has-text("作成"), a:has-text("新規"), a:has-text("作成")'
  ).first();
  if ((await newCaseBtn.count()) > 0) {
    await newCaseBtn.click();
    await page.waitForTimeout(800);
    await shot(page, "insurer/cases-new.png");
    await page.goBack();
    await page.waitForTimeout(500);
  } else {
    fs.copyFileSync(path.join(OUT, "insurer/cases.png"), path.join(OUT, "insurer/cases-new.png"));
  }

  await ctx.close();
}

async function captureAgent(browser: ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Login page
  await go(page, `${BASE_URL}/agent/login`);
  await shot(page, "agent/login.png");

  // Authenticate
  await login(page, AGENT_EMAIL, AGENT_PASSWORD, "/agent/login");

  // Dashboard
  await shot(page, "agent/dashboard.png");

  // Referrals list
  await go(page, `${BASE_URL}/agent/referrals`);
  await shot(page, "agent/referrals.png");

  // Try new referral form
  const newRefBtn = page.locator(
    'button:has-text("新規"), button:has-text("紹介"), a:has-text("新規"), a:has-text("紹介")'
  ).first();
  if ((await newRefBtn.count()) > 0) {
    await newRefBtn.click();
    await page.waitForTimeout(800);
    await shot(page, "agent/referrals-new.png");
    await page.goBack();
    await page.waitForTimeout(500);
  } else {
    fs.copyFileSync(path.join(OUT, "agent/referrals.png"), path.join(OUT, "agent/referrals-new.png"));
  }

  // Commissions
  await go(page, `${BASE_URL}/agent/commissions`);
  await shot(page, "agent/commissions.png");

  // Training
  await go(page, `${BASE_URL}/agent/training`);
  await shot(page, "agent/training.png");

  await ctx.close();
}

async function main() {
  console.log("📸 Capturing screenshots from", BASE_URL);
  // この環境（および CI）のプリインストール Chromium を使う。Playwright の
  // バージョンが上がると同梱ブラウザのリビジョンが変わり、ダウンロードを
  // 禁止している実行環境では起動できなくなるため、パスが指定されていれば従う。
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const failures: string[] = [];

  await captureAdmin(browser).catch((e) => {
    console.warn("⚠ Admin capture failed:", e.message);
    failures.push(`admin: ${e.message}`);
  });
  await captureInsurer(browser).catch((e) => {
    console.warn("⚠ Insurer capture failed:", e.message);
    failures.push(`insurer: ${e.message}`);
  });
  await captureAgent(browser).catch((e) => {
    console.warn("⚠ Agent capture failed:", e.message);
    failures.push(`agent: ${e.message}`);
  });

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} portal(s) failed to capture:`);
    failures.forEach((f) => console.error(`   - ${f}`));
    console.error("\nDebug screenshots are in public/screenshots/_debug-*.png");
    process.exit(1);
  }

  console.log("✅ Screenshots saved to public/screenshots/");
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
