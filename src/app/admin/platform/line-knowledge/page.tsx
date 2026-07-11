import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import PageHeader from "@/components/ui/PageHeader";
import LineKnowledgeClient from "@/app/admin/settings/line-knowledge/LineKnowledgeClient";

/**
 * `/admin/platform/line-knowledge` (運営専用)
 * ----------------------------------------------------------------
 * 全テナント共有の LINE ナレッジ (global_line_knowledge) を管理する。
 * ここに登録した内容は、ナレッジ自動返信を有効にした全店舗の回答ソースに
 * なる (店舗ナレッジと矛盾する場合は店舗側が優先)。
 */

export const dynamic = "force-dynamic";

export default async function PlatformLineKnowledgePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) redirect("/login?next=/admin/platform/line-knowledge");
  if (!isPlatformAdmin(caller)) redirect("/admin");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="運営専用"
        title="共有LINEナレッジ (全店舗共通の学習)"
        description="コーティング・車検などの一般知識を登録すると、ナレッジ自動返信を有効にした全店舗の LINE AI が共通の回答ソースとして参照します。店舗が登録した内容と矛盾する場合は店舗ナレッジが優先されます。"
      />
      <LineKnowledgeClient role="admin" apiBase="/api/admin/platform/line-knowledge" showActivationHint={false} />
    </div>
  );
}
