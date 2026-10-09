import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { certificatePublicUrl, resolveBaseUrl } from "@/lib/url";

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
});

describe("certificatePublicUrl [証明書 PDF の QR に刷る公開 URL]", () => {
  const keys = ["NEXT_PUBLIC_APP_URL", "APP_URL", "NEXT_PUBLIC_BASE_URL", "VERCEL_URL"] as const;
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  beforeEach(() => keys.forEach((k) => delete process.env[k]));
  afterEach(() =>
    keys.forEach((k) => (prev[k] === undefined ? delete process.env[k] : (process.env[k] = prev[k] as string))),
  );

  it("正規ドメインの環境変数を順に使い、末尾スラッシュ・スキーム無しを正規化する", () => {
    process.env.APP_URL = "https://app.ledra.co.jp/";
    process.env.VERCEL_URL = "ledra-git-x.vercel.app";
    expect(certificatePublicUrl("ABC-123")).toBe("https://app.ledra.co.jp/c/ABC-123");
    process.env.NEXT_PUBLIC_APP_URL = "app.ledra.co.jp";
    expect(certificatePublicUrl("ABC-123")).toBe("https://app.ledra.co.jp/c/ABC-123");
  });

  it("環境変数が無ければ localhost（リクエストのホストは受け取らない）", () => {
    expect(certificatePublicUrl("ABC")).toBe("http://localhost:3000/c/ABC");
  });
});
