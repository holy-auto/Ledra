/**
 * POST /api/customer/line-login — LINE ログインリンクをセッションに引き換える。
 *
 * 確認画面 (`/my/line`) のフォーム送信からのみ呼ばれる。GET で消費しないのは、
 * リンクプレビューやクローラの先読みで単回使用トークンが焼き切れるのを防ぐため。
 *
 * tenant はトークン側の値を正とする (URL/フォームの値は信用しない)。
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { consumePortalLoginToken, releasePortalLoginToken } from "@/lib/customerPortalLineLogin";
import { CUSTOMER_COOKIE, createSessionForCustomer } from "@/lib/customerPortalServer";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isSecureCookie = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  // ブラウザのフォーム送信なので、失敗はすべて JSON ではなく /my への redirect で返す。
  const backToLogin = (reason: string) => {
    const url = new URL("/my", req.nextUrl.origin);
    url.searchParams.set("reason", reason);
    // フォーム POST からの遷移なので 303 (GET で辿らせる)。
    return NextResponse.redirect(url, 303);
  };

  // 総当たりは 256bit トークンで現実的に不可能だが、連打自体は抑える。
  if (await checkRateLimit(req, "auth")) return backToLogin("rate_limited");

  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("t") ?? "").trim();
  } catch {
    return backToLogin("line_link_error");
  }

  let claimed: { tenantId: string; customerId: string } | null = null;
  try {
    claimed = await consumePortalLoginToken(token);
    // 期限切れ / 使用済み / 不正。どれかは伝えない (トークンの状態を漏らさない)。
    if (!claimed) return backToLogin("line_link_expired");

    const admin = createServiceRoleAdmin("マイページ LINE ログイン — tenant slug 解決 (顧客セッション発行前)");
    const { data: tenant } = await admin.from("tenants").select("slug").eq("id", claimed.tenantId).maybeSingle();
    const slug = String(tenant?.slug ?? "").trim();
    if (!slug) throw new Error(`tenant slug not found: ${claimed.tenantId}`);

    const sess = await createSessionForCustomer(claimed.tenantId, claimed.customerId);

    const res = NextResponse.redirect(new URL(`/customer/${encodeURIComponent(slug)}`, req.nextUrl.origin), 303);
    res.cookies.set(CUSTOMER_COOKIE, sess.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    logger.error("[portal-line-login] failed", { err: e instanceof Error ? e.message : String(e) });
    // トークンは消費済みだがセッションを張れていない。ここで戻さないと、こちら側の
    // 障害で顧客のリンクを永久に焼いてしまう (期限切れと区別が付かないまま入れなくなる)。
    if (claimed) await releasePortalLoginToken(token).catch(() => undefined);
    return backToLogin("line_link_error");
  }
}
