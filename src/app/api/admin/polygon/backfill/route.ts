/**
 * 管理者向け: 既存施工画像のブロックチェーン・バックフィル
 *
 * GET  /api/admin/polygon/backfill         — 未アンカーの画像件数を返す（残タスク確認）
 * POST /api/admin/polygon/backfill         — 未アンカー画像を最大 N 件だけ処理する
 *
 * 対象: sha256 IS NOT NULL AND polygon_tx_hash IS NULL
 *
 * 注意:
 *  - このエンドポイントは管理者ロール限定（admin 以上）
 *  - 1 回のリクエストあたり最大 20 件まで（ガス代・タイムアウト制御のため）
 *  - 現在のテナントに属する画像のみを対象にする（cross-tenant 漏洩防止）
 *  - Polygon アンカーが無効な環境では何もせず ok を返す
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { anchorToPolygon, verifyAnchor, findAnchorTx } from "@/lib/anchoring/providers";
import { computeAuthenticityGrade, type AuthenticityGrade, type C2paKind } from "@/lib/anchoring/authenticityGrade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 1 件あたり最大 15〜30 秒かかる可能性があるため、タイムアウトを長めに確保
export const maxDuration = 300;

const MAX_BATCH_SIZE = 20;
const DEFAULT_BATCH_SIZE = 10;

/** 未アンカー画像の件数を返す */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("この操作は管理者のみ実行できます。");
    }

    const admin = createAdminClient();

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
      max_batch_size: MAX_BATCH_SIZE,
    });
  } catch (e) {
    return apiInternalError(e, "admin/polygon/backfill GET");
  }
}

/** 未アンカー画像を最大 N 件だけアンカリング */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("この操作は管理者のみ実行できます。");
    }

    if (process.env.POLYGON_ANCHOR_ENABLED !== "true") {
      return apiValidationError(
        "Polygon アンカーが無効化されています。POLYGON_ANCHOR_ENABLED を true にしてください。",
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit ?? DEFAULT_BATCH_SIZE);
    const limit = Math.min(Math.max(1, Math.floor(requestedLimit)), MAX_BATCH_SIZE);

    const admin = createAdminClient();
    const c2paMode = (process.env.C2PA_MODE ?? "disabled") as "disabled" | "dev-signed" | "production";

    // 対象画像を取得（テナント scope + 再計算に必要なフラグも同時に取得）
    const { data: candidates, error: fetchErr } = await admin
      .from("certificate_images")
      .select(
        "id, sha256, authenticity_grade, c2pa_verified, device_attestation_verified, deepfake_verdict, exif_gps_stripped, certificate_id, certificates!inner(tenant_id)",
      )
      .eq("certificates.tenant_id", caller.tenantId)
      .not("sha256", "is", null)
      .is("polygon_tx_hash", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchErr) {
      return apiInternalError(fetchErr, "admin/polygon/backfill fetch");
    }

    if (!candidates || candidates.length === 0) {
      return apiOk({ processed: 0, anchored: 0, reused: 0, failed: 0, results: [] });
    }

    const results: Array<{
      id: string;
      sha256_prefix: string;
      status: "anchored" | "reused" | "failed" | "skipped";
      tx_hash?: string | null;
      network?: string | null;
      grade_before?: AuthenticityGrade;
      grade_after?: AuthenticityGrade;
      error?: string;
    }> = [];

    let anchoredOk = 0;
    let reused = 0;
    let failed = 0;

    // 逐次処理（nonce 競合を避けるため並列化しない）
    for (const img of candidates) {
      const sha = String(img.sha256 ?? "");
      const shaPrefix = sha.slice(0, 12);

      if (!sha) {
        results.push({ id: img.id as string, sha256_prefix: "", status: "skipped" });
        continue;
      }

      // 現在のフラグから grade を再計算（polygon 記録の有無で変わるわけではないが、
      // 画像アップロード時と backfill 時でロジックが変わっている可能性があるので毎回再計算して一貫性を保つ）
      const gradeBefore = ((img as { authenticity_grade?: string }).authenticity_grade ??
        "unverified") as AuthenticityGrade;
      const deepfakeVerdict = (img as { deepfake_verdict?: string | null }).deepfake_verdict ?? null;
      const deepfakeOk =
        deepfakeVerdict === "likely_real" ? true : deepfakeVerdict === "likely_fake" ? false : null;
      const gradeAfter = computeAuthenticityGrade({
        hasSha256: true,
        hasExif: Boolean((img as { exif_gps_stripped?: boolean }).exif_gps_stripped),
        hasC2pa: Boolean((img as { c2pa_verified?: boolean }).c2pa_verified),
        c2paKind: (c2paMode === "disabled" ? "none" : c2paMode) as C2paKind,
        deviceOk: Boolean((img as { device_attestation_verified?: boolean }).device_attestation_verified),
        deepfakeOk,
      });

      try {
        // #5: ガス節約 — 既にオンチェーン記録済みなら anchor 書き込みをスキップ
        const alreadyOnChain = await verifyAnchor(sha);

        let txHash: string | null = null;
        let network: "polygon" | "amoy" | null = null;
        let status: "anchored" | "reused" | "failed" = "failed";
        let errorMsg: string | undefined;

        if (alreadyOnChain) {
          // events ログから元 tx を引っ張る
          const existing = await findAnchorTx(sha);
          if (existing) {
            txHash = existing.txHash;
            network = existing.network;
            status = "reused";
          } else {
            // オンチェーンには存在するが tx が見つからない（ログ保持期間外など）
            // 仕方ないので anchor() を呼んで冪等に no-op 消化させ、その tx を記録
            const anchorResult = await anchorToPolygon(sha);
            if (anchorResult.anchored && anchorResult.txHash) {
              txHash = anchorResult.txHash;
              network = anchorResult.network;
              status = "anchored";
            } else {
              errorMsg = "already on-chain but couldn't recover tx (contract reverted on re-anchor)";
            }
          }
        } else {
          const anchorResult = await anchorToPolygon(sha);
          if (anchorResult.anchored && anchorResult.txHash) {
            txHash = anchorResult.txHash;
            network = anchorResult.network;
            status = "anchored";
          } else {
            errorMsg = "anchor returned disabled/failed result";
          }
        }

        if (status === "failed" || !txHash) {
          failed += 1;
          results.push({
            id: img.id as string,
            sha256_prefix: shaPrefix,
            status: "failed",
            error: errorMsg,
          });
          continue;
        }

        const updatePayload: Record<string, unknown> = {
          polygon_tx_hash: txHash,
          polygon_network: network,
        };
        if (gradeAfter !== gradeBefore) {
          updatePayload.authenticity_grade = gradeAfter;
        }

        const { error: updateErr } = await admin
          .from("certificate_images")
          .update(updatePayload)
          .eq("id", img.id);

        if (updateErr) {
          failed += 1;
          results.push({
            id: img.id as string,
            sha256_prefix: shaPrefix,
            status: "failed",
            error: `DB update failed: ${updateErr.message}`,
          });
        } else {
          if (status === "reused") reused += 1;
          else anchoredOk += 1;
          results.push({
            id: img.id as string,
            sha256_prefix: shaPrefix,
            status,
            tx_hash: txHash,
            network,
            grade_before: gradeBefore,
            grade_after: gradeAfter,
          });
        }
      } catch (err) {
        failed += 1;
        results.push({
          id: img.id as string,
          sha256_prefix: shaPrefix,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.info(
      `[polygon:backfill] tenant=${caller.tenantId} processed=${candidates.length} anchored=${anchoredOk} reused=${reused} failed=${failed}`,
    );

    return apiOk({
      processed: candidates.length,
      anchored: anchoredOk,
      reused,
      failed,
      results,
    });
  } catch (e) {
    return apiInternalError(e, "admin/polygon/backfill POST");
  }
}
