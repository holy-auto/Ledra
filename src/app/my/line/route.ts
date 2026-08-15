/**
 * GET /my/line?t=<token> — LINE から届いたリンクでマイページにログインする。
 *
 * email を持たない顧客はメール宛 OTP を受け取れずマイページに入れないため、LINE 連携済み
 * (＝本人性が取れている) 顧客には単回使用トークン付きの URL を送り、ここでセッションに
 * 引き換える。tenant はトークン側の値を正とする (URL パラメータは信用しない)。
 *
 * 失敗時は /my (通常ログイン) へ戻し、期限切れは LINE で再発行できる旨を伝える。
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

export async function GET(req: NextRequest) {
  // ブラウザのページ遷移なので、失敗はすべて JSON ではなく /my への redirect で返す。
  const backToLogin = (reason: string) => {
    const url = new URL("/my", req.nextUrl.origin);
    url.searchParams.set("reason", reason);
    return NextResponse.redirect(url);
  };

  // 総当たりは 256bit トークンで現実的に不可能だが、連打自体は抑える。
  if (await checkRateLimit(req, "auth")) return backToLogin("rate_limited");

  const token = (req.nextUrl.searchParams.get("t") ?? "").trim();
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

    const res = NextResponse.redirect(new URL(`/customer/${encodeURIComponent(slug)}`, req.nextUrl.origin));
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
