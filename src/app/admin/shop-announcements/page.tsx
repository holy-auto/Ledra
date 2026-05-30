import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import ShopAnnouncementsClient from "./ShopAnnouncementsClient";

/**
 * `/admin/shop-announcements`
 * ----------------------------------------------------------------
 * テナント別の顧客向けお知らせを作成・公開する。
 * `translation.auto_translate` が opt-in のテナントでは、公開/保存時に
 * 英・中・越へ自動翻訳され、顧客ポータルで多言語表示される。
 */
export const dynamic = "force-dynamic";

export default async function ShopAnnouncementsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/shop-announcements");

  const canEdit = requireMinRole(caller, "admin");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="ANNOUNCEMENTS"
        title="店舗お知らせ"
        description="顧客向けのお知らせを作成・公開します。自動翻訳が有効なら英・中・越へ翻訳され、外国語の顧客にもそのまま届きます。"
      />
      {!canEdit && (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-xs text-muted">
          閲覧のみ可能です。作成・編集は管理者 (admin) 以上で行ってください。
        </div>
      )}
      <ShopAnnouncementsClient canEdit={canEdit} />
    </main>
  );
}
