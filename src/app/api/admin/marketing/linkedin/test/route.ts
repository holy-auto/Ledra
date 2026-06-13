/**
 * 管理者向け: LinkedIn 自動投稿の手動テスト用エンドポイント
 *
 * GET  /api/admin/marketing/linkedin/test
 *   投稿はせず、認証状態（トークン解決のドライラン）と直近の投稿ログを返す。
 *   「いま投稿できる状態か？」の確認用。
 *
 * POST /api/admin/marketing/linkedin/test
 *   いますぐ「次の1本」を投稿する（cronを待たずに動作確認）。
 *   クエリ:
 *     ?dryRun=1   投稿せずトークン解決だけ確認
 *     ?day=5      ローテーションを無視して day=5 の投稿を送る
 *
 * 認証: プラットフォーム管理者（Ledra運営）限定。自社の公式LinkedInに投稿する
 * 操作のため、一般テナントの管理者には開放しない。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { runLinkedInPost } from "@/lib/marketing/runLinkedInPost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 投稿可否の確認（ドライラン）＋直近ログ */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) {
      return apiForbidden("この操作はプラットフォーム管理者のみ実行できます。");
    }

    const admin = createPlatformScopedAdmin("admin:marketing/linkedin/test — dry-run + recent log");

    const dryRun = await runLinkedInPost(admin, { dryRun: true });

    const { data: recent } = await admin
      .from("marketing_linkedin_log")
      .select("post_day, status, linkedin_urn, error, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    return apiOk({
      ready: dryRun.status === "dry-run-ok",
      enabled: process.env.LINKEDIN_AUTOPOST_ENABLED === "true",
      next: dryRun,
      recent: recent ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "admin/marketing/linkedin/test GET");
  }
}

/** いますぐ投稿（または day 指定／ドライラン） */
export async function POST(req: NextRequest) {
  // A real post hits the live company page; rate-limit to avoid accidental spam.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) {
      return apiForbidden("この操作はプラットフォーム管理者のみ実行できます。");
    }

    const params = req.nextUrl.searchParams;
    const dryRun = params.get("dryRun") === "1" || params.get("dryRun") === "true";
    const dayParam = params.get("day");
    const forcedDay = dayParam != null && /^\d+$/.test(dayParam) ? Number(dayParam) : undefined;

    const admin = createPlatformScopedAdmin("admin:marketing/linkedin/test — manual post trigger");
    const result = await runLinkedInPost(admin, { forcedDay, dryRun });

    return apiOk({ result });
  } catch (e) {
    return apiInternalError(e, "admin/marketing/linkedin/test POST");
  }
}
