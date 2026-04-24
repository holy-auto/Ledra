import { NextRequest } from "next/server";
import { apiJson } from "@/lib/api/response";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { renderCertificatePdf, type CertRow } from "@/lib/pdfCertificate";

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

const CONCURRENCY = 5;

async function handler(req: NextRequest) {
  const body = await req.json();
  const { job_id, tenant_id, public_ids } = body as {
    job_id: string;
    tenant_id: string;
    public_ids: string[];
  };

  const { admin } = createTenantScopedAdmin(tenant_id);

  await admin
    .from("batch_pdf_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job_id);

  try {
    // 現在の進捗を取得（再試行・再開対応）
    const { data: currentJob } = await admin
      .from("batch_pdf_jobs")
      .select("processed_count, result_urls")
      .eq("id", job_id)
      .single();

    const alreadyProcessed = currentJob?.processed_count ?? 0;
    type BatchPdfResult = { public_id: string; pdf_url: string } | { public_id: string; error: string };
    const resultUrls: BatchPdfResult[] = (currentJob?.result_urls as BatchPdfResult[] | null) ?? [];

    // 未処理分のみ対象
    const remainingIds = public_ids.slice(alreadyProcessed);

    // 証明書データを一括取得
    const { data: certs, error: fetchErr } = await admin
      .from("certificates")
      .select(
        "id, public_id, status, customer_name, vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, logo_asset_path, created_at, service_type, ppf_coverage_json, coating_products_json, warranty_period_end, warranty_exclusions, current_version, maintenance_json, body_repair_json",
      )
      .eq("tenant_id", tenant_id)
      .in("public_id", remainingIds);

    if (fetchErr) throw fetchErr;

    const certMap = new Map((certs ?? []).map((c) => [c.public_id, c]));

    // アンカー情報を一括取得 (N+1 回避)
    const certIds = (certs ?? []).map((c) => (c as { id: string }).id);
    const anchorsByCertId = new Map<
      string,
      Array<{
        sha256: string | null;
        polygon_tx_hash: string | null;
        polygon_network: "polygon" | "amoy" | null;
      }>
    >();

    if (certIds.length > 0) {
      const { data: images } = await admin
        .from("certificate_images")
        .select("certificate_id, sha256, polygon_tx_hash, polygon_network, sort_order")
        .in("certificate_id", certIds)
        .not("polygon_tx_hash", "is", null)
        .order("sort_order", { ascending: true });

      for (const img of images ?? []) {
        const cid = img.certificate_id as string;
        const list = anchorsByCertId.get(cid) ?? [];
        list.push({
          sha256: (img.sha256 as string | null) ?? null,
          polygon_tx_hash: (img.polygon_tx_hash as string | null) ?? null,
          polygon_network:
            img.polygon_network === "polygon" || img.polygon_network === "amoy"
              ? (img.polygon_network as "polygon" | "amoy")
              : null,
        });
        anchorsByCertId.set(cid, list);
      }
    }

    const baseUrl = getBaseUrl();
    let newlyProcessed = 0;

    // 5件ずつ並列処理（バッチごとに進捗を保存）
    for (let i = 0; i < remainingIds.length; i += CONCURRENCY) {
      const chunk = remainingIds.slice(i, i + CONCURRENCY);

      const settled = await Promise.allSettled(
        chunk.map(async (pid) => {
          const cert = certMap.get(pid);
          if (!cert) {
            return { public_id: pid, error: "証明書が見つかりません。" };
          }

          try {
            const publicUrl = `${baseUrl}/c/${cert.public_id}`;
            const anchors = anchorsByCertId.get((cert as { id: string }).id) ?? [];
            // `cert` はここで Supabase select 結果。CertRow は nullable の
            // 組み合わせが微妙に揃わないので、上位 narrowing が済んでいる
            // 前提で CertRow として扱う。
            const pdfBuffer = await renderCertificatePdf(cert as unknown as CertRow, publicUrl, anchors);
            const pdfBytes = new Uint8Array(pdfBuffer);

            const storagePath = `batch-pdf/${tenant_id}/${pid}-${Date.now()}.pdf`;
            const { error: uploadErr } = await admin.storage.from("certificates").upload(storagePath, pdfBytes, {
              contentType: "application/pdf",
              upsert: true,
            });

            if (uploadErr) {
              return { public_id: pid, error: "PDF アップロードに失敗しました。" };
            }

            const { data: signedData, error: signErr } = await admin.storage
              .from("certificates")
              .createSignedUrl(storagePath, 3600);

            if (signErr || !signedData?.signedUrl) {
              return { public_id: pid, error: "署名付きURL の生成に失敗しました。" };
            }

            return { public_id: pid, pdf_url: signedData.signedUrl };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "不明なエラー";
            return { public_id: pid, error: `PDF 生成に失敗: ${msg}` };
          }
        }),
      );

      for (const result of settled) {
        if (result.status === "fulfilled") {
          resultUrls.push(result.value);
        } else {
          resultUrls.push({ public_id: "unknown", error: "予期しないエラー" });
        }
        newlyProcessed++;
      }

      // バッチごとに進捗更新
      await admin
        .from("batch_pdf_jobs")
        .update({
          processed_count: alreadyProcessed + newlyProcessed,
          result_urls: resultUrls,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    }

    // 全件完了
    await admin
      .from("batch_pdf_jobs")
      .update({
        status: "completed",
        processed_count: public_ids.length,
        result_urls: resultUrls,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    console.info(`[batch-pdf] job=${job_id} completed count=${public_ids.length}`);

    return apiJson({ success: true });
  } catch (e) {
    console.error("[batch-pdf] job failed:", e);
    await admin
      .from("batch_pdf_jobs")
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
