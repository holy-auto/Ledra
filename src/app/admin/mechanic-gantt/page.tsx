import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isAdvancedFeatureVisibleForUser } from "@/lib/features/serverVisibility";
import PageHeader from "@/components/ui/PageHeader";
import GanttBoardLive from "@/components/admin/gantt/GanttBoardLive";
import { todayJst } from "@/lib/gantt/board";
import { loadGanttData } from "@/lib/gantt/loadGanttData";

export const dynamic = "force-dynamic";

/**
 * メカニック稼働ガント（WORKSTREAM C）。
 * 当日の予約を assigned_user_id でスタッフ行に割り当て、08:00–19:00 を 30 分刻みで表示。
 * 初期データは SSR で描画し、以降は GanttBoardLive が `/api/admin/gantt` を
 * ポーリングして運用ディスプレイとしてリアルタイム更新する。
 * advanced 機能（既定 OFF）。サイドバー導線は feature catalog で出し分け。
 */
export default async function MechanicGanttPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/mechanic-gantt");

  const tenantId = caller.tenantId;

  // advanced 機能ゲート（既定 OFF）。URL 直叩きでも未 opt-in / テナント無効なら 404。
  if (!(await isAdvancedFeatureVisibleForUser(tenantId, caller.userId, "mechanic-gantt"))) {
    notFound();
  }

  const today = todayJst();
  const initialData = await loadGanttData(supabase, tenantId, today);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="業務"
        title="メカニック稼働管理"
        description="本日のシフトを 30 分刻みで可視化。10 秒ごとに自動更新されるので、開きっぱなしの運用ディスプレイとして使えます。"
      />
      <GanttBoardLive initialData={initialData} dateStr={today} />
    </div>
  );
}
