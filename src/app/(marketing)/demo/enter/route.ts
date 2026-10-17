import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { DEMO_EMAIL } from "@/lib/demo";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /demo/enter
 *
 * デモアカウントで自動サインインして /admin/certificates へリダイレクトする。
 * URL を共有するだけでデモダッシュボードを閲覧できるようにするための入口。
 *
 * - パスワードは使わない。service role で magic link のトークンを発行し（メールは送られない）、
 *   その場で verifyOtp してセッション cookie を張る。パスワードをソースにも画面にも置かないので、
 *   誰かがデモのパスワードを変えてもこの入口は止まらない。
 * - デモテナントの書き込みは RESTRICTIVE RLS でブロック済み
 *   (supabase/migrations/20261016135012_demo_member_readonly_all_tables.sql)
 * - 共有 URL なので `auth` preset でレート制限し、ブルートフォースの踏み台化を防ぐ
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const admin = createServiceRoleAdmin("demo/enter: issue a session for the public read-only demo account");
  const supabase = await createSupabaseServerClient();

  // ponytail: generateLink はユーザーに1つしかトークンを持たせない（発行で前のを上書き）。
  // 同時に入ると先の人の verify が失敗するので、ばらけた待ち時間を置いて2回まで取り直す。
  // それでも負けるほど同時アクセスが増えたら、入口を待ち行列にするかセッションを使い回す。
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 + Math.random() * 200 * attempt));
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_EMAIL,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      lastError = linkErr ?? new Error("generateLink returned no hashed_token");
      continue;
    }
    const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
  }

  if (lastError) {
    logger.error("demo auto-login failed", lastError, { email: DEMO_EMAIL });
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
