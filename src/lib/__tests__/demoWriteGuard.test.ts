import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { stripComments, walkSource } from "./sourceScan";

const DEMO_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

const lookup = vi.fn(async () => ({ data: [{ user_id: DEMO_USER }], error: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: lookup }) }) }),
}));

import { GUARDED_PREFIXES, demoWriteGuard, isGuardedWrite, resetDemoMemberCacheForTest } from "@/lib/demoWriteGuard";

const KEY = "sb-abcdref-auth-token";

function jwt(sub: string): string {
  return `h.${stringToBase64URL(JSON.stringify({ sub }))}.sig`;
}

/** @supabase/ssr と同じ形（base64- 接頭辞・大きいと .0 .1 … に分割）の session cookie */
function sessionCookies(sub: string, opts: { userId?: string; chunkSize?: number } = {}): string {
  const session = { access_token: jwt(sub), user: { id: opts.userId ?? sub } };
  const value = "base64-" + stringToBase64URL(JSON.stringify(session));
  return createChunks(KEY, value, opts.chunkSize)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function req(method: string, path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.example.com${path}`, { method, headers });
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdref.supabase.co";
});

beforeEach(() => {
  resetDemoMemberCacheForTest();
  lookup.mockClear();
  lookup.mockImplementation(async () => ({ data: [{ user_id: DEMO_USER }], error: null }));
});

describe("demoWriteGuard", () => {
  it("デモ利用者の書き込みを断る（Web の cookie・分割 cookie・モバイルの Bearer・サーバーアクション）", async () => {
    const cookie = { cookie: sessionCookies(DEMO_USER) };
    expect((await demoWriteGuard(req("POST", "/api/certificates/create", cookie)))?.status).toBe(403);
    expect(
      (await demoWriteGuard(req("PATCH", "/api/admin/x", { cookie: sessionCookies(DEMO_USER, { chunkSize: 40 }) })))
        ?.status,
    ).toBe(403);
    expect(
      (await demoWriteGuard(req("POST", "/api/mobile/certificates", { authorization: `Bearer ${jwt(DEMO_USER)}` })))
        ?.status,
    ).toBe(403);
    expect((await demoWriteGuard(req("POST", "/admin/settings", { ...cookie, "next-action": "abc" })))?.status).toBe(
      403,
    );
    // 読めない Bearer を付けても、cookie 側でデモ利用者と分かれば断る
    expect(
      (await demoWriteGuard(req("DELETE", "/api/admin/x", { ...cookie, authorization: "Bearer not-a-jwt" })))?.status,
    ).toBe(403);
  });

  it("cookie の user.id を書き換えても、署名された access_token の sub で断る", async () => {
    const forged = { cookie: sessionCookies(DEMO_USER, { userId: OTHER_USER }) };
    expect((await demoWriteGuard(req("POST", "/api/certificates/create", forged)))?.status).toBe(403);
  });

  it("読み取り・公開ページの送信・他の利用者・未ログインは通す", async () => {
    const cookie = { cookie: sessionCookies(DEMO_USER) };
    expect(await demoWriteGuard(req("GET", "/api/admin/x", cookie))).toBeNull();
    for (const path of ["/api/auth/context", "/login", "/api/admin/billing-state", "/api/contact", "/api/signup"]) {
      expect(await demoWriteGuard(req("POST", path, cookie))).toBeNull();
    }
    expect(await demoWriteGuard(req("POST", "/api/admin/x", { cookie: sessionCookies(OTHER_USER) }))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/admin/x"))).toBeNull();
  });

  it("所属者の取得が失敗・例外のときは通し、30 秒は問い合わせ直さない", async () => {
    lookup.mockImplementation(async () => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
    });
    const cookie = { cookie: sessionCookies(DEMO_USER) };
    expect(await demoWriteGuard(req("POST", "/api/admin/x", cookie))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/admin/y", cookie))).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("isGuardedWrite はメソッドの大小文字を区別しない", () => {
    expect(isGuardedWrite("post", "/api/admin/x")).toBe(true);
    expect(isGuardedWrite("head", "/api/admin/x")).toBe(false);
  });

  it("テナントの利用者として書き込む route は、すべて GUARDED_PREFIXES の下にある", () => {
    const auth = /\bwithCaller\s*[<(]|\bresolveMobileCaller\(|\bresolveCallerWithRole\(|\bresolveActiveMembership\(/;
    const write = /export (const|async function) (POST|PUT|PATCH|DELETE)\b/;
    const routes = walkSource("src/app/api", (n) => n === "route.ts").filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"), f);
      return write.test(src) && auth.test(src);
    });
    // 当たりを取る: 走査が空なら何も見ていない
    expect(routes.length).toBeGreaterThan(300);
    const uncovered = routes
      .map((f) => f.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""))
      .filter((p) => !GUARDED_PREFIXES.some((g) => p.startsWith(g)));
    expect(uncovered).toEqual([]);
  });
});
