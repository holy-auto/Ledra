import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "@/lib/api/response";
import { withQstashSignature } from "@/lib/qstash/verifySignature";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { anchorToPolygon, verifyAnchor, findAnchorTx } from "@/lib/anchoring/providers";
import {
  computeAuthenticityGrade,
  highestGrade,
  type AuthenticityGrade,
  type C2paKind,
} from "@/lib/anchoring/authenticityGrade";
import { upsertVehiclePassport } from "@/lib/passport/upsertVehiclePassport";
import { enqueuePolygonBackfillNextBatch } from "@/lib/qstash/publish";

const polygonBackfillSchema = z.object({
  job_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH_SIZE = 50;

async function handler(req: NextRequest) {
  const parsed = polygonBackfillSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiJson({ error: "invalid payload" }, { status: 400 });
  }
  const { job_id, tenant_id } = parsed.data;

  const { admin } = createTenantScopedAdmin(tenant_id);

  await admin
    .from("polygon_backfill_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job_id);

  try {
    const c2paMode = (process.env.C2PA_MODE ?? "disabled") as "disabled" | "dev-signed" | "production";

    // バッチサイズ分だけ未アンカー画像を取得（nonce 競合防止のため逐次処理を維持）
    const { data: candidates, error: fetchErr } = await admin
      .from("certificate_images")
      .select(
        "id, certificate_id, sha256, authenticity_grade, c2pa_verified, device_attestation_verified, deepfake_verdict, certificates!inner(tenant_id)",
      )
      .eq("certificates.tenant_id", tenant_id)
      .not("sha256", "is", null)
      .is("polygon_tx_hash", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    let processedCount = 0;
    let succeededCount = 0;
    const anchoredCertIds = new Set<string>();

    for (const img of candidates ?? []) {
      const sha = String(img.sha256 ?? "");
      if (!sha) continue;

      const gradeBefore = ((img as { authenticity_grade?: string }).authenticity_grade ??
        "unverified") as AuthenticityGrade;
      const deepfakeVerdict = (img as { deepfake_verdict?: string | null }).deepfake_verdict ?? null;
      const deepfakeOk = deepfakeVerdict === "likely_real" ? true : deepfakeVerdict === "likely_fake" ? false : null;
      // Anchoring does not feed the authenticity tier, and the capture-binding
      // gate (nonceOk) is decided at upload and not reconstructable from these
      // columns. So compute conservatively and NEVER downgrade below the stored
      // grade — backfill only ever preserves or upgrades.
      const gradeAfter = computeAuthenticityGrade({
        hasSha256: true,
        hasC2pa: Boolean((img as { c2pa_verified?: boolean }).c2pa_verified),
        c2paKind: (c2paMode === "disabled" ? "none" : c2paMode) as C2paKind,
        hasTsa: false,
        deviceOk: Boolean((img as { device_attestation_verified?: boolean }).device_attestation_verified),
        nonceOk: false,
        deepfakeOk,
      });
      const nextGrade = highestGrade([gradeBefore, gradeAfter]);

      try {
        const alreadyOnChain = await verifyAnchor(sha);
        let txHash: string | null = null;
        let network: "polygon" | "amoy" | null = null;
        let status: "anchored" | "reused" | "failed" = "failed";

        if (alreadyOnChain) {
          const existing = await findAnchorTx(sha);
          if (existing) {
            txHash = existing.txHash;
            network = existing.network;
            status = "reused";
          } else {
            const result = await anchorToPolygon(sha);
            if (result.anchored && result.txHash) {
              txHash = result.txHash;
              network = result.network;
              status = "anchored";
            }
          }
        } else {
          const result = await anchorToPolygon(sha);
          if (result.anchored && result.txHash) {
            txHash = result.txHash;
            network = result.network;
            status = "anchored";
          }
        }

        if (status !== "failed" && txHash) {
          // polygon_tx_hash/polygon_network は certificate_images_guard の
          // 対象外(凍結証跡列ではない)。authenticity_grade は対象列なので、
          // 親証明書が draft 以外だと更新が拒否されうる。同じ UPDATE に
          // まとめると tx hash の記録までブロックされ、この画像が永遠に
          // 未アンカーとして再キューされ続けるため、別 UPDATE に分離する。
          const { error: txError } = await admin
            .from("certificate_images")
            .update({ polygon_tx_hash: txHash, polygon_network: network })
            .eq("id", img.id);

          if (txError) {
            console.error("[polygon-backfill] tx hash update failed", {
              imageId: img.id,
              error: txError.message,
            });
          } else {
            succeededCount++;
            const certId = (img as { certificate_id?: string | null }).certificate_id;
            if (certId) anchoredCertIds.add(certId);

            if (nextGrade !== gradeBefore) {
              const { error: gradeError } = await admin
                .from("certificate_images")
                .update({ authenticity_grade: nextGrade })
                .eq("id", img.id);
              if (gradeError) {
                // certificate_images_guard が拒否するのは P0001 のみ。それ以外
                // (ネットワーク断等の一時的失敗)は tx hash が既に書き込み済みで
                // polygon_tx_hash IS NULL の対象から外れてしまい、このまま握り
                // つぶすと等級の底上げ機会を永久に失う。想定内のガード拒否と
                // 見分けられるよう error でログし、原因調査できるようにする。
                const isGuardRejection =
                  gradeError.code === "P0001" && gradeError.message?.includes("certificate_images");
                if (isGuardRejection) {
                  // 発行済み/取消済み/期限切れの親を持つ画像は仕様どおりのブロック。
                  // tx hash は既に記録済みで前進はしている(等級の上書きだけが凍結される)。
                  console.warn("[polygon-backfill] grade upgrade blocked (frozen evidence)", {
                    imageId: img.id,
                    error: gradeError.message,
                  });
                } else {
                  console.error("[polygon-backfill] grade update failed unexpectedly (not a freeze guard rejection)", {
                    imageId: img.id,
                    error: gradeError.message,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        // 生の err は RPC レスポンス・スタック等を含み得るので message のみ。
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("[polygon-backfill] img failed", { imageId: img.id, errorMsg });
      }

      processedCount++;
    }

    // After the batch finishes, upsert vehicle_passports for every cert
    // that had at least one image newly anchored. Run in parallel with a
    // bounded concurrency so a long passport recompute doesn't block the
    // self-requeue. Errors are logged but never fail the job — the passport
    // is a denormalized projection that the next anchor will reconverge.
    if (anchoredCertIds.size > 0) {
      await Promise.all(
        Array.from(anchoredCertIds).map((certId) =>
          upsertVehiclePassport(certId).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[polygon-backfill] passport upsert failed", { certId, msg });
          }),
        ),
      );
    }

    // 累積進捗を取得して更新
    const { data: currentJob } = await admin
      .from("polygon_backfill_jobs")
      .select("processed_count")
      .eq("id", job_id)
      .single();

    const totalProcessed = (currentJob?.processed_count ?? 0) + processedCount;

    // 残件数を確認して自己再キューイングか完了かを判断
    const { count: remaining } = await admin
      .from("certificate_images")
      .select("id, certificates!inner(tenant_id)", { count: "exact", head: true })
      .eq("certificates.tenant_id", tenant_id)
      .not("sha256", "is", null)
      .is("polygon_tx_hash", null);

    if (remaining && remaining > 0) {
      // ゼロ進捗検知: バッチが 1 件もアンカーできなかった場合、同じ 50 件を
      // 永遠に再取得するだけなので failed にして再キューを止める。
      // ponytail: バッチ単位の全滅検知のみ。upgrade path は画像単位の retry budget
      // （certificate_images に試行カウンタを持たせて毒画像だけスキップ）。
      if (succeededCount === 0 && (candidates?.length ?? 0) > 0) {
        await admin
          .from("polygon_backfill_jobs")
          .update({
            status: "failed",
            processed_count: totalProcessed,
            error_message: `batch made no progress: 0/${candidates?.length ?? 0} images anchored (remaining=${remaining})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
        console.error(`[polygon-backfill] job=${job_id} stalled: zero successes in batch, not requeueing`);
        // 200 を返して QStash 側のメッセージ再試行も止める（ジョブは failed 記録済み）
        return apiJson({ success: false, stalled: true, processed: processedCount });
      }

      await enqueuePolygonBackfillNextBatch({ job_id, tenant_id, total_processed: totalProcessed });

      await admin
        .from("polygon_backfill_jobs")
        .update({
          processed_count: totalProcessed,
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    } else {
      await admin
        .from("polygon_backfill_jobs")
        .update({
          processed_count: totalProcessed,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    }

    console.info(`[polygon-backfill] job=${job_id} batch=${processedCount} remaining=${remaining ?? 0}`);

    return apiJson({ success: true, processed: processedCount });
  } catch (e) {
    console.error("[polygon-backfill] job failed:", e);
    await admin
      .from("polygon_backfill_jobs")
      .update({
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);
    return apiJson({ error: "Job failed" }, { status: 500 });
  }
}

export const POST = withQstashSignature(handler);
