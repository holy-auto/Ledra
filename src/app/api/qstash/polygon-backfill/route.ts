import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "@/lib/api/response";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { anchorToPolygon, verifyAnchor, findAnchorTx } from "@/lib/anchoring/providers";
import { computeAuthenticityGrade, type AuthenticityGrade, type C2paKind } from "@/lib/anchoring/authenticityGrade";
import { Client } from "@upstash/qstash";

const polygonBackfillSchema = z.object({
  job_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

export const runtime = "nodejs";
export const maxDuration = 300;

function getBaseUrl(): string {
  const url = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL,
  ].find(Boolean);
  if (!url) throw new Error("Base URL not set");
  return url.startsWith("http") ? url : `https://${url}`;
}

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
        "id, sha256, authenticity_grade, c2pa_verified, device_attestation_verified, deepfake_verdict, exif_gps_stripped, certificates!inner(tenant_id)",
      )
      .eq("certificates.tenant_id", tenant_id)
      .not("sha256", "is", null)
      .is("polygon_tx_hash", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    let processedCount = 0;

    for (const img of candidates ?? []) {
      const sha = String(img.sha256 ?? "");
      if (!sha) continue;

      const gradeBefore = ((img as { authenticity_grade?: string }).authenticity_grade ??
        "unverified") as AuthenticityGrade;
      const deepfakeVerdict = (img as { deepfake_verdict?: string | null }).deepfake_verdict ?? null;
      const deepfakeOk = deepfakeVerdict === "likely_real" ? true : deepfakeVerdict === "likely_fake" ? false : null;
      const gradeAfter = computeAuthenticityGrade({
        hasSha256: true,
        hasExif: Boolean((img as { exif_gps_stripped?: boolean }).exif_gps_stripped),
        hasC2pa: Boolean((img as { c2pa_verified?: boolean }).c2pa_verified),
        c2paKind: (c2paMode === "disabled" ? "none" : c2paMode) as C2paKind,
        deviceOk: Boolean((img as { device_attestation_verified?: boolean }).device_attestation_verified),
        deepfakeOk,
      });

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
          const updatePayload: Record<string, unknown> = {
            polygon_tx_hash: txHash,
            polygon_network: network,
          };
          if (gradeAfter !== gradeBefore) {
            updatePayload.authenticity_grade = gradeAfter;
          }
          await admin.from("certificate_images").update(updatePayload).eq("id", img.id);
        }
      } catch (err) {
        console.error(`[polygon-backfill] img ${img.id} failed:`, err);
      }

      processedCount++;
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
      const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
      await qstash.publishJSON({
        url: `${getBaseUrl()}/api/qstash/polygon-backfill`,
        body: { job_id, tenant_id },
        retries: 2,
        delay: 5,
      });

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

export const POST = verifySignatureAppRouter(handler);
