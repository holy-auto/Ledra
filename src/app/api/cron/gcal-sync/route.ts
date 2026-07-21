import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron/failureTracker";
import { pushReservationsToCalendar, pullEventsFromCalendar } from "@/lib/gcal/client";
import { logger } from "@/lib/logger";
import { computeSyncWindow } from "./window";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 55s ガード（Vercel の 60s 上限に対し 5s のバッファ）。テナントを跨ぐ前に確認する。
const CRON_TIMEOUT_MS = 55_000;
const CRON_TASK = "gcal-sync";

/**
 * GET /api/cron/gcal-sync
 *
 * 連携有効テナントの Google カレンダーを定期的に双方向同期する（イベント駆動の
 * push に加えて、GCal 側の変更を pull で取り込むため）。vercel.json の cron で起動。
 *
 * 各テナントごとに:
 *   - push: gcal_event_id 未設定の予約を GCal へ作成
 *   - pull: GCal のイベントを予約へ取り込み/更新/キャンセル反映
 *   - tenants.gcal_last_synced_at を更新
 *
 * 個別テナントの失敗はベストエフォート（他テナントは継続）。ジョブ到達＝成功として
 * cron_failure_streaks をリセットし、致命的失敗のみ failure として記録する。
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  const admin = createServiceRoleAdmin(
    "cron:gcal-sync — periodic bidirectional Google Calendar sync across connected tenants",
  );

  try {
    // getCalendarClient と同じ前提（有効 + refresh token あり）でテナントを絞る。
    // calendar_id 未設定でも getCalendarClient が 'primary' にフォールバックするため対象に含める。
    const { data: tenants, error } = await admin
      .from("tenants")
      .select("id, name")
      .eq("is_active", true)
      .eq("gcal_sync_enabled", true)
      .not("gcal_refresh_token", "is", null);

    if (error) {
      await recordCronFailure(admin, CRON_TASK, error);
      return apiInternalError(error, "gcal-sync cron fetch tenants");
    }

    const { from, to } = computeSyncWindow(new Date());

    const results: Array<{
      tenantId: string;
      status: "ok" | "error";
      pushed?: number;
      imported?: number;
      updated?: number;
      cancelled?: number;
      skipped?: number;
      error?: string;
    }> = [];
    let processed = 0;
    let syncErrors = 0;
    let timedOut = false;

    for (const t of tenants ?? []) {
      // タイムアウトガード: 残りテナントは次回の実行に回す（撃ち切りより取りこぼしを可視化）。
      if (Date.now() - startTime > CRON_TIMEOUT_MS) {
        timedOut = true;
        logger.warn("[gcal-sync cron] timeout guard reached, remaining tenants deferred to next run", {
          processed,
          total: (tenants ?? []).length,
        });
        break;
      }

      const tenantId = t.id as string;
      try {
        const pushed = await pushReservationsToCalendar(tenantId, from, to);
        const pull = await pullEventsFromCalendar(tenantId, from, to);
        await admin.from("tenants").update({ gcal_last_synced_at: new Date().toISOString() }).eq("id", tenantId);
        results.push({
          tenantId,
          status: "ok",
          pushed,
          imported: pull.imported,
          updated: pull.updated,
          cancelled: pull.cancelled,
          skipped: pull.skipped,
        });
        processed++;
      } catch (e) {
        syncErrors++;
        const message = e instanceof Error ? e.message : String(e);
        results.push({ tenantId, status: "error", error: message });
        // 個別失敗はジョブ全体を落とさない（他テナントの同期を継続）。
        logger.warn("[gcal-sync cron] tenant sync failed (continuing)", { tenantId, error: message });
      }
    }

    // ジョブ自体は実行到達＝成功として streak をリセット（個別失敗は results / gcal_sync_log に残る）。
    await recordCronSuccess(admin, CRON_TASK);

    return apiOk({
      task: CRON_TASK,
      tenants: (tenants ?? []).length,
      processed,
      errors: syncErrors,
      timed_out: timedOut,
      window: { from, to },
      results,
    });
  } catch (e) {
    await recordCronFailure(admin, CRON_TASK, e);
    return apiInternalError(e, "gcal-sync cron");
  }
}
