import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * `next` クエリは内部相対パス (/foo/bar) のみ許可する。
 * `//evil.com`, `/\evil.com`, `https://evil.com` などはオープンリダイレクト
 * 攻撃のため拒否し、ルート ("/") にフォールバックする。
 */
function safeInternalPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  // protocol-relative ("//host") / backslash-tricked ("/\\host") を除外
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/**
 * エラー時の戻り先を `next` のコンテキストから決める。
 * 施工店(/admin)・代理店(/agent) のマジックリンクは /login へ、
 * それ以外（保険会社フロー）は従来どおり /insurer/login へ。
 */
function loginPathForNext(next: string): string {
  if (next.startsWith("/admin") || next.startsWith("/agent")) return "/login";
  return "/insurer/login";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"));
  const loginPath = loginPathForNext(next);

  if (!code) {
    return NextResponse.redirect(new URL(`${loginPath}?error=missing_code`, url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`${loginPath}?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
