import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron/failureTracker";
import { pushReservationsToCalendar, pullEventsFromCalendar } from "@/lib/gcal/client";
import { logger } from "@/lib/logger";
import { computeSyncWindow } from "./window";
import { enqueueGcalTenantSync } from "@/lib/qstash/publish";

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
    const { data: secretRows, error: secretError } = await admin
      .from("tenant_private_secrets")
      .select("tenant_id")
      .or("gcal_refresh_token_ciphertext.not.is.null,gcal_refresh_token_legacy.not.is.null");
    if (secretError) {
      await recordCronFailure(admin, CRON_TASK, secretError);
      return apiInternalError(secretError, "gcal-sync cron fetch credentials");
    }
    const connectedTenantIds = (secretRows ?? []).map((row) => row.tenant_id as string);
    const tenantQuery = admin
      .from("tenants")
      .select("id, name, gcal_last_synced_at")
      .eq("is_active", true)
      .eq("gcal_sync_enabled", true)
      // 毎回同じ先頭テナントだけが処理されないよう、未同期・最終同期が古い順にする。
      .order("gcal_last_synced_at", { ascending: true, nullsFirst: true });
    const { data: tenants, error } = connectedTenantIds.length
      ? await tenantQuery.in("id", connectedTenantIds)
      : { data: [], error: null };

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

    const tenantList = tenants ?? [];
    const FANOUT_CONCURRENCY = process.env.QSTASH_TOKEN ? 10 : 2;
    for (let offset = 0; offset < tenantList.length; offset += FANOUT_CONCURRENCY) {
      // タイムアウトガード: 残りテナントは次回の実行に回す（撃ち切りより取りこぼしを可視化）。
      if (Date.now() - startTime > CRON_TIMEOUT_MS) {
        timedOut = true;
        logger.warn("[gcal-sync cron] timeout guard reached, remaining tenants deferred to next run", {
          processed,
          total: tenantList.length,
        });
        break;
      }
      await Promise.all(
        tenantList.slice(offset, offset + FANOUT_CONCURRENCY).map(async (t) => {
          const tenantId = t.id as string;
          try {
            const queued = await enqueueGcalTenantSync({ tenant_id: tenantId, from, to });
            if (queued) {
              results.push({ tenantId, status: "ok", skipped: 0 });
              processed++;
              return;
            }
            // QStash未設定の開発環境だけは従来の同期処理へフォールバックする。
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
            logger.warn("[gcal-sync cron] tenant sync failed (continuing)", { tenantId, error: message });
          }
        }),
      );
    }

    // 一部失敗は許容（ベストエフォート）。ただし対象があるのに全滅した場合は systemic 障害
    // （Google API 全断・認証失効など）とみなし failure として記録し、streak をリセットしない。
    if (syncErrors > 0 && processed === 0) {
      await recordCronFailure(admin, CRON_TASK, new Error(`all ${syncErrors} tenant sync(s) failed`));
    } else {
      await recordCronSuccess(admin, CRON_TASK);
    }

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
