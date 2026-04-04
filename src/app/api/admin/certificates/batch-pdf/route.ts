import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceBilling } from "@/lib/billing/guard";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";
import { renderCertificatePdf } from "@/lib/pdfCertificate";
import {
  apiUnauthorized,
  apiValidationError,
  apiForbidden,
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BATCH = 20;

function buildBaseUrl(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * POST /api/admin/certificates/batch-pdf
 * Body: { public_ids: string[] }   (max 20)
 *
 * Returns array of { public_id, pdf_url } or { public_id, error }.
 * PDFs are uploaded to Supabase Storage and signed URLs are returned.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    // Billing check (starter+)
    const billingDeny = await enforceBilling(req, { minPlan: "starter", action: "batch_pdf", tenantId: caller.tenantId });
    if (billingDeny) return billingDeny as any;

    // Parse body
    const body = await req.json().catch(() => null);
    const publicIds: unknown = body?.public_ids;

    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return apiValidationError("public_ids は必須です（配列）。");
    }
    if (publicIds.length > MAX_BATCH) {
      return apiValidationError(`一度に処理できるのは最大 ${MAX_BATCH} 件です。`);
    }
    const ids = publicIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (ids.length === 0) {
      return apiValidationError("有効な public_id がありません。");
    }

    const admin = createAdminClient();

    // Verify all certificates belong to caller's tenant
    const { data: certs, error: fetchErr } = await admin
      .from("certificates")
      .select(
        "id, public_id, status, customer_name, vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value, logo_asset_path, created_at, service_type, ppf_coverage_json, coating_products_json, warranty_period_end, warranty_exclusions, current_version, maintenance_json, body_repair_json",
      )
      .eq("tenant_id", caller.tenantId)
      .in("public_id", ids);

    if (fetchErr) {
      return apiInternalError(fetchErr, "admin/certificates/batch-pdf fetch");
    }

    const certMap = new Map((certs ?? []).map((c) => [c.public_id, c]));

    const baseUrl = buildBaseUrl(req);
    const { ip, userAgent } = getRequestMeta(req);

    type ResultItem =
      | { public_id: string; pdf_url: string }
      | { public_id: string; error: string };

    // Process a single PDF
    const processSinglePdf = async (pid: string): Promise<ResultItem> => {
      const cert = certMap.get(pid);
      if (!cert) {
        return { public_id: pid, error: "証明書が見つかりません。" };
      }

      try {
        const publicUrl = `${baseUrl}/c/${cert.public_id}`;
        const pdfBuffer = await renderCertificatePdf(cert as any, publicUrl);
        const pdfBytes = new Uint8Array(pdfBuffer as any);

        // Upload to Supabase Storage
        const storagePath = `batch-pdf/${caller.tenantId}/${pid}-${Date.now()}.pdf`;
        const { error: uploadErr } = await admin.storage
          .from("certificates")
          .upload(storagePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadErr) {
          return { public_id: pid, error: "PDF アップロードに失敗しました。" };
        }

        // Create signed URL (valid for 1 hour)
        const { data: signedData, error: signErr } = await admin.storage
          .from("certificates")
          .createSignedUrl(storagePath, 3600);

        if (signErr || !signedData?.signedUrl) {
          return { public_id: pid, error: "署名付きURL の生成に失敗しました。" };
        }

        // Audit (fire-and-forget)
        logCertificateAction({
          type: "certificate_pdf_batch",
          tenantId: caller.tenantId,
          publicId: pid,
          certificateId: cert.id,
          userId: caller.userId,
          description: "一括PDF生成",
          ip,
          userAgent,
        });

        return { public_id: pid, pdf_url: signedData.signedUrl };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "不明なエラー";
        return { public_id: pid, error: `PDF 生成に失敗: ${msg}` };
      }
    };

    // Process in chunks of 5 concurrent PDFs
    const CONCURRENCY = 5;
    const results: ResultItem[] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(chunk.map(processSinglePdf));
      for (const result of settled) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          // Should not happen since processSinglePdf catches internally, but handle gracefully
          results.push({ public_id: "unknown", error: "予期しないエラー" });
        }
      }
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e) {
    return apiInternalError(e, "admin/certificates/batch-pdf");
  }
}
