import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /demo/enter
 *
 * デモアカウントで自動サインインして /admin/certificates へリダイレクトする。
 * URL を共有するだけでデモダッシュボードを閲覧できるようにするための入口。
 *
 * - 認証情報は src/lib/demo.ts の DEMO_EMAIL / DEMO_PASSWORD（公開済み）
 * - デモテナントの書き込みは RESTRICTIVE RLS でブロック済み
 *   (supabase/migrations/20260514000001_demo_tenant_readonly.sql)
 * - 共有 URL なので `auth` preset でレート制限し、ブルートフォースの踏み台化を防ぐ
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (error) {
    logger.error("demo auto-login failed", error, { email: DEMO_EMAIL });
    return NextResponse.redirect(new URL("/demo?e=1", req.url));
  }

  // 既存セッションが代理店モードだったケース等を上書きし、施工店ダッシュボードに着地させる
  const cookieStore = await cookies();
  cookieStore.set("active_context", "shop", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.redirect(new URL("/admin/certificates", req.url));
}
