import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBaseUrl } from "@/lib/url";

/**
 * resolveBaseUrl の `preferRequestOrigin` を検証する。
 *
 * 背景: Supabase の PKCE メール認証（マジックリンク / サインアップ / SAML）は
 * verifier Cookie をリクエストオリジンに張るため、コールバックも同一オリジンで
 * ないと交換に失敗する。ユーザーが正規ドメイン(APP_URL)以外（例: Vercel の
 * プロジェクト URL）でアクセスしているときにログインできなくなる回帰を防ぐ。
 */
describe("resolveBaseUrl", () => {
  const prevAppUrl = process.env.APP_URL;

  beforeEach(() => {
    process.env.APP_URL = "https://app.ledra.co.jp";
  });
  afterEach(() => {
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
  });

  const reqOn = (host: string) =>
    new Request("https://ignored/api/x", { headers: { host, "x-forwarded-proto": "https" } });

  it("defaults to APP_URL over the request origin (notification links stay canonical)", () => {
    expect(resolveBaseUrl({ req: reqOn("ledra-preview.vercel.app") })).toBe("https://app.ledra.co.jp");
  });

  it("preferRequestOrigin returns the request origin so the PKCE verifier Cookie matches", () => {
    expect(resolveBaseUrl({ req: reqOn("ledra-preview.vercel.app"), preferRequestOrigin: true })).toBe(
      "https://ledra-preview.vercel.app",
    );
  });

  it("preferRequestOrigin falls back to APP_URL when no request is available", () => {
    expect(resolveBaseUrl({ preferRequestOrigin: true })).toBe("https://app.ledra.co.jp");
  });

  it("tenantCustomDomain still wins even with preferRequestOrigin", () => {
    expect(
      resolveBaseUrl({
        req: reqOn("ledra-preview.vercel.app"),
        preferRequestOrigin: true,
        tenantCustomDomain: "cert.holy-auto.jp",
      }),
    ).toBe("https://cert.holy-auto.jp");
  });
});
