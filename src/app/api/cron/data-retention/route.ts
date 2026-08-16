/**
 * GET /api/cron/data-retention
 *
 * 日次でデータ保持ポリシー (`docs/data-retention.md`) に従って期限超過
 * 行を削除する。Vercel Cron で 03:00 JST (= 18:00 UTC) に実行。
 *
 * - customer_login_codes : 30 日経過 → 物理削除
 * - customer_portal_login_tokens : expires_at + 30 日経過 → 物理削除
 *   (LINE ログインリンク。連携のたび・「マイページ」受信のたびに 1 行増えるので、
 *    消さないと認証メタデータが無制限に溜まる)
 * - customer_sessions    : revoked_at + 90 日経過 → 物理削除
 * - notification_logs    : 180 日経過 → 物理削除
 * - outbox_events delivered : 90 日経過 → 物理削除
 * - stripe_processed_events : 90 日経過 → 物理削除
 * - reservations.work_lat/lng : 完了 (work_completed_at) + 90 日経過 → 座標を NULL 化
 *   (出張作業場所の位置情報は顧客宅になり得るため最小権限・短期保持。行は消さず座標のみ消す)
 *
 * 失敗は Sentry + Resend (`sendCronFailureAlert`) で通知される。
 * 件数が多い場合は cron 1 回で全消化せず、次回に持ち越す。
 */

import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNK = 5_000;

interface DeletionRule {
  table: string;
  /** Column for the cutoff comparison. */
  column: string;
  /** Days since now() that mark deletion. */
  days: number;
  /** Optional: extra eq filter (e.g. status='delivered'). */
  filter?: { col: string; val: string };
}

const RULES: DeletionRule[] = [
  { table: "customer_login_codes", column: "created_at", days: 30 },
  // 期限切れ後 30 日で削除。TTL 7 日なので 1 行の寿命は最長でも約 37 日。
  // 使用済み (used_at あり) の行も expires_at は入っているのでこの規則で拾える。
  { table: "customer_portal_login_tokens", column: "expires_at", days: 30 },
  { table: "customer_sessions", column: "revoked_at", days: 90 },
  { table: "notification_logs", column: "sent_at", days: 180 },
  { table: "outbox_events", column: "delivered_at", days: 90, filter: { col: "status", val: "delivered" } },
  { table: "stripe_processed_events", column: "received_at", days: 90 },
];

async function pruneRule(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  rule: DeletionRule,
): Promise<{ table: string; deleted: number }> {
  const cutoff = new Date(Date.now() - rule.days * 24 * 3600 * 1000).toISOString();

  // Fetch a batch of IDs first (DELETE without limit on Postgrest is fine,
  // but we want the count and a hard cap per cron tick).
  let q = admin.from(rule.table).select("id").lte(rule.column, cutoff).limit(CHUNK);
  if (rule.filter) q = q.eq(rule.filter.col, rule.filter.val);
  const { data, error } = await q;
  if (error) {
    logger.warn("retention: select failed", { table: rule.table, error: error.message });
    return { table: rule.table, deleted: 0 };
  }
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { table: rule.table, deleted: 0 };

  const { error: delErr, count } = await admin.from(rule.table).delete({ count: "exact" }).in("id", ids);
  if (delErr) {
    logger.warn("retention: delete failed", { table: rule.table, error: delErr.message });
    return { table: rule.table, deleted: 0 };
  }
  return { table: rule.table, deleted: count ?? ids.length };
}

/** 出張作業場所GPSの保持期間ポリシー（完了から N 日）。 */
const WORK_GPS_RETENTION_DAYS = 90;

/**
 * 完了から WORK_GPS_RETENTION_DAYS 日経過した予約の出張作業場所座標を NULL 化する。
 * 行は削除せず、work_lat/work_lng/work_gps_at のみ消す（顧客宅位置になり得る座標を短期保持）。
 * 1 cron あたり CHUNK 件でキャップし、多い場合は次回に持ち越す（削除ルールと同方針）。
 */
async function redactExpiredWorkGps(
  admin: ReturnType<typeof createServiceRoleAdmin>,
): Promise<{ table: string; deleted: number }> {
  const cutoff = new Date(Date.now() - WORK_GPS_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("reservations")
    .select("id")
    .lte("work_completed_at", cutoff)
    .not("work_lat", "is", null)
    .limit(CHUNK);
  if (error) {
    logger.warn("retention: work_gps select failed", { error: error.message });
    return { table: "reservations.work_gps", deleted: 0 };
  }
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { table: "reservations.work_gps", deleted: 0 };

  const { error: upErr, count } = await admin
    .from("reservations")
    .update({ work_lat: null, work_lng: null, work_gps_at: null }, { count: "exact" })
    .in("id", ids);
  if (upErr) {
    logger.warn("retention: work_gps redact failed", { error: upErr.message });
    return { table: "reservations.work_gps", deleted: 0 };
  }
  return { table: "reservations.work_gps", deleted: count ?? ids.length };
}

export async function GET(req: NextRequest) {
  const { authorized, error: authErr } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authErr);

  try {
    const admin = createServiceRoleAdmin("cron:data-retention — sweeps every tenant for expired rows");

    const result = await withCronLock(admin, "data-retention", 600, async () => {
      const out: Array<{ table: string; deleted: number }> = [];
      for (const rule of RULES) {
        out.push(await pruneRule(admin, rule));
      }
      // 出張作業場所GPSは削除ではなく座標の NULL 化（完了から90日）。
      out.push(await redactExpiredWorkGps(admin));
      return out;
    });

    if (!result.acquired) return apiOk({ skipped: "lock_held" });

    const total = result.value.reduce((s, r) => s + r.deleted, 0);
    logger.info("data-retention cron complete", { total, breakdown: result.value });

    return apiOk({ ok: true, total, breakdown: result.value });
  } catch (e) {
    await sendCronFailureAlert("data-retention", e instanceof Error ? e.message : String(e));
    return apiInternalError(e, "cron/data-retention");
  }
}
