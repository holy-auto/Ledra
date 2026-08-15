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
import { consumePortalLoginToken } from "@/lib/customerPortalLineLogin";
import { CUSTOMER_COOKIE, createSessionForCustomer } from "@/lib/customerPortalServer";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isSecureCookie = process.env.NODE_ENV === "production";

export async function GET(req: NextRequest) {
  // 総当たりは 256bit トークンで現実的に不可能だが、連打自体は抑える。
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const token = (req.nextUrl.searchParams.get("t") ?? "").trim();
  const failure = new URL("/my", req.nextUrl.origin);

  try {
    const claimed = await consumePortalLoginToken(token);
    if (!claimed) {
      // 期限切れ / 使用済み / 不正。どれかは伝えない (トークンの状態を漏らさない)。
      failure.searchParams.set("reason", "line_link_expired");
      return NextResponse.redirect(failure);
    }

    const admin = createServiceRoleAdmin("マイページ LINE ログイン — tenant slug 解決 (顧客セッション発行前)");
    const { data: tenant } = await admin.from("tenants").select("slug").eq("id", claimed.tenantId).maybeSingle();
    const slug = String(tenant?.slug ?? "").trim();
    if (!slug) {
      failure.searchParams.set("reason", "line_link_expired");
      return NextResponse.redirect(failure);
    }

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
    failure.searchParams.set("reason", "line_link_expired");
    return NextResponse.redirect(failure);
  }
}
