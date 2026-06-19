import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveDefaultRedirect } from "@/lib/auth/loginRedirect";

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`${loginPath}?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  // 施工店マジックリンクは next を汎用センチネル "/admin" で送る。実際の遷移先は
  // ユーザーのコンテキスト（施工店 / 代理店 / 本社）から判定し、agent-only や
  // 組織ユーザーが /admin に着地してログインへ跳ね返される問題を防ぐ。
  if (next === "/admin") {
    const userId = data.user?.id;
    if (userId) {
      const cookieStore = await cookies();
      const activeContext = cookieStore.get("active_context")?.value ?? null;
      const destination = await resolveDefaultRedirect(userId, activeContext);
      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
