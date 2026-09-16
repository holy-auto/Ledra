/**
 * 管理者向け: 既存施工画像のブロックチェーン・バックフィル
 *
 * GET  /api/admin/polygon/backfill  — 未アンカーの画像件数を返す（残タスク確認）
 * POST /api/admin/polygon/backfill  — QStash 経由で非同期バックフィルをキューイング
 *
 * 対象: sha256 IS NOT NULL AND polygon_tx_hash IS NULL
 *
 * 注意:
 *  - このエンドポイントは管理者ロール限定（admin 以上）
 *  - 実際の処理は /api/qstash/polygon-backfill Worker が行う（バッチサイズ50件）
 *  - 現在のテナントに属する画像のみを対象にする（cross-tenant 漏洩防止）
 *  - Polygon アンカーが無効な環境では何もせず ok を返す
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";

import { enqueuePolygonBackfill } from "@/lib/qstash/publish";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 未アンカー画像の件数を返す */
export const GET = withCaller(
  async (_req, { caller }) => {
    try {
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const [{ count: pendingCount }, { count: anchoredCount }] = await Promise.all([
        admin
          .from("certificate_images")
          .select("id, certificates!inner(tenant_id)", { count: "exact", head: true })
          .eq("certificates.tenant_id", caller.tenantId)
          .not("sha256", "is", null)
          .is("polygon_tx_hash", null),
        admin
          .from("certificate_images")
          .select("id, certificates!inner(tenant_id)", { count: "exact", head: true })
          .eq("certificates.tenant_id", caller.tenantId)
          .not("polygon_tx_hash", "is", null),
      ]);

      return apiOk({
        pending: pendingCount ?? 0,
        anchored: anchoredCount ?? 0,
        enabled: process.env.POLYGON_ANCHOR_ENABLED === "true",
        network: process.env.POLYGON_NETWORK ?? "polygon",
      });
    } catch (e) {
      return apiInternalError(e, "admin/polygon/backfill GET");
    }
  },
  { minRole: "admin", routeName: "admin/polygon/backfill GET" },
);

/** 未アンカー画像のバックフィルを QStash 経由で非同期キューイング */
export const POST = withCaller(
  async (_req, { caller }) => {
    // Each call enqueues an on-chain backfill (real gas spend on Polygon).
    // Auth preset (10/min/IP) protects against repeated submissions if a
    // session leaks; legitimate operators only run this rarely.

    try {
      if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
        return apiValidationError(
          "Polygon アンカーが無効化されています。POLYGON_ANCHOR_ENABLED を true にしてください。",
        );
      }

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { count, error: countErr } = await admin
        .from("certificate_images")
        .select("id, certificates!inner(tenant_id)", { count: "exact", head: true })
        .eq("certificates.tenant_id", caller.tenantId)
        .not("sha256", "is", null)
        .is("polygon_tx_hash", null);

      if (countErr) return apiInternalError(countErr, "admin/polygon/backfill count");

      if (!count || count === 0) {
        return apiOk({ message: "アンカー待ちの画像はありません。", job_id: null });
      }

      const { data: job, error: jobErr } = await admin
        .from("polygon_backfill_jobs")
        .insert({
          tenant_id: caller.tenantId,
          status: "queued",
          total_count: count,
          processed_count: 0,
        })
        .select("id")
        .single();

      if (jobErr) return apiInternalError(jobErr, "admin/polygon/backfill job create");

      await enqueuePolygonBackfill({ job_id: job.id, tenant_id: caller.tenantId });

      console.info(`[polygon:backfill] tenant=${caller.tenantId} queued job=${job.id} total=${count}`);

      return apiOk({
        message: `${count}件のアンカリングをキューに追加しました`,
        job_id: job.id,
      });
    } catch (e) {
      return apiInternalError(e, "admin/polygon/backfill POST");
    }
  },
  { rateLimit: "auth", minRole: "admin", routeName: "admin/polygon/backfill POST" },
);
