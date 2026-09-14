import { Page, APIRequestContext, BrowserContext, request as playwrightRequest } from "@playwright/test";

/**
 * 管理者として /login からログインして /admin に到達するまで待つ。
 * セッションクッキーは渡された Page の BrowserContext に保持される。
 */
export async function loginAsAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 15000 });
}

/**
 * BrowserContext のクッキーを読んで、API リクエスト用の Cookie ヘッダ文字列を組み立てる。
 * Playwright の APIRequestContext は storageState 経由でクッキーを引き継げないことがあるため、
 * 明示的に Cookie ヘッダを付ける形を取る。
 */
export async function buildCookieHeader(ctx: BrowserContext, baseURL: string): Promise<string> {
  const cookies = await ctx.cookies(baseURL);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * BrowserContext のクッキーを取り込んだ APIRequestContext を返す。
 * 認証済みの fetch 互換クライアントとしてテストから使う。
 */
export async function authedRequest(ctx: BrowserContext, baseURL: string): Promise<APIRequestContext> {
  const cookieHeader = await buildCookieHeader(ctx, baseURL);
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * E2E_USER_EMAIL / E2E_USER_PASSWORD が両方セットされているか。
 * 未設定なら spec 側で test.skip する。
 */
export function hasAdminCreds(): Credentials | null {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
