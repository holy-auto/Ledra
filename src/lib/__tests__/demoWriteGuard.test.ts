import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const DEMO_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [{ user_id: DEMO_USER }], error: null }) }),
    }),
  }),
}));

import { demoWriteGuard, isGuardedWrite } from "@/lib/demoWriteGuard";

const KEY = "sb-abcdref-auth-token";

function jwt(sub: string): string {
  return `h.${stringToBase64URL(JSON.stringify({ sub }))}.sig`;
}

function sessionCookies(sub: string, chunkSize?: number): string {
  // @supabase/ssr と同じ形（base64- 接頭辞・大きいと .0 .1 … に分割）で作る
  const value = "base64-" + stringToBase64URL(JSON.stringify({ access_token: jwt(sub), user: { id: sub } }));
  return createChunks(KEY, value, chunkSize)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function req(method: string, path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.example.com${path}`, { method, headers });
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdref.supabase.co";
});

describe("demoWriteGuard", () => {
  it("デモ利用者の書き込みを断る（Web の cookie・分割 cookie・モバイルの Bearer・サーバーアクション）", async () => {
    const cookie = { cookie: sessionCookies(DEMO_USER) };
    expect((await demoWriteGuard(req("POST", "/api/certificates/create", cookie)))?.status).toBe(403);
    expect(
      (await demoWriteGuard(req("PATCH", "/api/admin/x", { cookie: sessionCookies(DEMO_USER, 40) })))?.status,
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

  it("読み取り・セッションの出入り・他の利用者・未ログインは通す", async () => {
    const cookie = { cookie: sessionCookies(DEMO_USER) };
    expect(await demoWriteGuard(req("GET", "/api/admin/x", cookie))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/auth/context", cookie))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/login", cookie))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/admin/billing-state", cookie))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/admin/x", { cookie: sessionCookies(OTHER_USER) }))).toBeNull();
    expect(await demoWriteGuard(req("POST", "/api/admin/x"))).toBeNull();
  });

  it("isGuardedWrite はメソッドの大小文字を区別しない", () => {
    expect(isGuardedWrite("post", "/api/x")).toBe(true);
    expect(isGuardedWrite("head", "/api/x")).toBe(false);
  });
});
