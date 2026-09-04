import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";

/**
 * サイトコンテンツ3画面（一覧・新規・編集）の共通ガード。
 *
 * 画面側は長く「ログイン済みか」しか見ていなかった。`site_content:*` を
 * super_admin 限定にした結果、加盟店ユーザーが URL 直打ちで来ると
 * **押せば必ず forbidden になるボタンとフォームだけが並ぶ画面**になる
 * （MISTAKE_LEDGER M-019 と同じ形）。ナビから消すだけでは画面は残る。
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
