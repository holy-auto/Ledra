/**
 * GET /api/cron/accounting-sync
 *
 * Vercel Cron から呼ばれる、全テナント・全プロバイダの一括同期エンドポイント。
 * vercel.json で 1 日 3 回 (例: 9/13/19 時) を想定。
 *
 * 設計:
 *  - status='active' && auto_sync_enabled=true の integration を全件取得
 *  - 1 件ずつ syncTenantToProvider() を呼ぶ (provider 内の rate limit を尊重)
 *  - 55 秒タイムアウトガード — Vercel の 60 秒上限の手前で安全側に止める
 *  - 失敗テナントは sync_runs に "failed" として残り、UI で確認できる
 */

import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron/failureTracker";
import { syncTenantToProvider } from "@/lib/accounting/sync";
import type { AccountingProvider } from "@/lib/accounting/types";
import { logger } from "@/lib/logger";
import { enqueueAccountingTenantSync } from "@/lib/qstash/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_TIMEOUT_MS = 55_000;

type RunSummary = {
  tenantId: string;
  provider: AccountingProvider;
  attempted: number;
  synced: number;
  failed: number;
  reason?: string;
};

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const log = logger.child({ cron: "accounting-sync" });

  try {
    const auth = verifyCronRequest(req);
    if (!auth.authorized) return apiUnauthorized(auth.error);

    const admin = createServiceRoleAdmin("cron:accounting-sync — fans out freee/MF sync across every connected tenant");

    const { data: integrations, error } = await admin
      .from("accounting_integrations")
      .select("tenant_id, provider, last_synced_at")
      .eq("status", "active")
      .eq("auto_sync_enabled", true)
      // タイムアウトで後続を延期しても、次回は最も待っている連携から再開する。
      .order("last_synced_at", { ascending: true, nullsFirst: true });

    if (error) {
      log.error("failed to fetch integrations", error);
      return apiInternalError(error, "accounting cron list");
    }

    const targets = (integrations ?? []) as Array<{ tenant_id: string; provider: AccountingProvider }>;
    if (targets.length === 0) {
      log.info("no active accounting integrations to sync");
      return apiOk({ processed: 0, synced: 0, failed: 0, results: [] });
    }

    log.info(`processing ${targets.length} integration(s)`);

    const results: RunSummary[] = [];
    let totalSynced = 0;
    let totalFailed = 0;

    const FANOUT_CONCURRENCY = process.env.QSTASH_TOKEN ? 10 : 2;
    for (let offset = 0; offset < targets.length; offset += FANOUT_CONCURRENCY) {
      if (Date.now() - startedAt > CRON_TIMEOUT_MS) {
        log.warn("timeout guard reached, stopping further syncs");
        break;
      }
      await Promise.all(
        targets.slice(offset, offset + FANOUT_CONCURRENCY).map(async (t) => {
          try {
            const queued = await enqueueAccountingTenantSync({ tenant_id: t.tenant_id, provider: t.provider });
            if (queued) {
              results.push({
                tenantId: t.tenant_id,
                provider: t.provider,
                attempted: 0,
                synced: 0,
                failed: 0,
                reason: "queued",
              });
              return;
            }
            // QStash未設定の開発環境だけはインライン同期へフォールバックする。
            const r = await syncTenantToProvider({
              tenantId: t.tenant_id,
              provider: t.provider,
              triggerType: "scheduled",
            });
            results.push({
              tenantId: t.tenant_id,
              provider: t.provider,
              attempted: r.attempted,
              synced: r.synced,
              failed: r.failed,
              reason: r.reason,
            });
            totalSynced += r.synced;
            totalFailed += r.failed;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log.error(`tenant=${t.tenant_id} provider=${t.provider} failed`, e);
            results.push({
              tenantId: t.tenant_id,
              provider: t.provider,
              attempted: 0,
              synced: 0,
              failed: 1,
              reason: msg,
            });
            totalFailed += 1;
          }
        }),
      );
    }

    const elapsed = Date.now() - startedAt;
    log.info(`done in ${elapsed}ms: integrations=${results.length} synced=${totalSynced} failed=${totalFailed}`);

    // G7: cron 全体は完走 → streak リセット
    const trackerSupabase = createServiceRoleAdmin("accounting-sync cron success tracker");
    await recordCronSuccess(trackerSupabase, "accounting-sync");

    return apiOk({
      processed: results.length,
      synced: totalSynced,
      failed: totalFailed,
      elapsed_ms: elapsed,
      results,
    });
  } catch (e) {
    await sendCronFailureAlert("accounting-sync", e);
    const trackerSupabase = createServiceRoleAdmin("accounting-sync cron failure tracker");
    await recordCronFailure(trackerSupabase, "accounting-sync", e, { threshold: 3 });
    return apiInternalError(e, "accounting cron GET");
  }
}
