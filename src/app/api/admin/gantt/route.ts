import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isAdvancedFeatureVisibleForUser } from "@/lib/features/serverVisibility";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { todayJst } from "@/lib/gantt/board";
import { loadGanttData } from "@/lib/gantt/loadGanttData";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * メカニック稼働ガントの live データ。
 * `GanttBoardLive` が SWR で定期ポーリングし、運用ディスプレイをリアルタイム更新する。
 * SSR ページ（mechanic-gantt/page.tsx）と同じ `loadGanttData` を共有する。
 *
 * GET /api/admin/gantt?date=YYYY-MM-DD（省略時は当日 JST）
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // ページと同じ advanced 機能ゲート（既定 OFF）。未 opt-in は 404。
    if (!(await isAdvancedFeatureVisibleForUser(caller.tenantId, caller.userId, "mechanic-gantt"))) {
      return apiNotFound();
    }

    // 不正な date は黙って当日にフォールバック（任意の文字列で SQL に流さない）。
    const raw = new URL(req.url).searchParams.get("date");
    const dateStr = raw && DATE_RE.test(raw) ? raw : todayJst();

    const data = await loadGanttData(supabase, caller.tenantId, dateStr);
    return apiJson({ data }, { cacheControl: "no-store" });
  } catch (e: unknown) {
    return apiInternalError(e, "gantt GET");
  }
}
