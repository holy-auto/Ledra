import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";

/**
 * サイトコンテンツ3画面（一覧・新規・編集）の共通ガード。
 *
 * 画面側は長く「ログイン済みか」しか見ていなかった。
 *
 * クライアント側には `AdminRouteGuard` があり、`ROUTE_PERMISSIONS` の
 * `/admin/site-content` → `site_content:view` を見て権限が無ければ画面を
 * エラーカードに差し替える。**だからボタンが並び続けるわけではない。**
 * それでもサーバ側に置く理由は3つある。
 *
 * 1. `AdminRouteGuard` は `"use client"` で、判定は `/api/admin/me` の応答を
 *    待ってから走る。**Server Component の取得はその前に完了している**ので、
 *    権限の無い相手にもクエリが実行され、結果が RSC ペイロードに載る。
 * 2. `roleLoading` の間は children をそのまま描画する。判定が付くまでの
 *    一瞬、権限の無い画面が見える。
 * 3. 判定がブラウザにしか無いと、サーバ側の真実が RLS だけになる。
 *
 * 加盟店にとってこの画面には見るものが無い（RLS で下書きは見えず、
 * 保存も削除もできない）ので、メッセージを出さず /admin に戻す。
 */
export async function requireSiteContentAdmin(next: string) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect(`/login?next=${next}`);
  if (!requirePermission(caller, "site_content:view")) redirect("/admin");
  return supabase;
}
