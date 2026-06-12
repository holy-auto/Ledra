/**
 * POST /api/admin/documents/batch-pdf
 *
 * 選択された帳票 (1〜50 件) をまとめて PDF 化し、ZIP で返す。
 * 1 件だけの場合は最適化として PDF を直接返す。
 *
 * 認証: セッション (resolveCallerWithRole) + staff 以上。
 * テナント境界: caller.tenantId で検証し、その tenant に属する document の
 *   みを描画する (cross-tenant id は無視)。
 */
import type { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiNotFound, apiInternalError, applySecurityHeaders } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { documentBatchPdfSchema } from "@/lib/validations/document";
import { generateBatchDocumentZip, renderTenantDocumentPdfs } from "@/lib/pdf/batchDocumentPdf";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) {
    return apiForbidden("帳票をダウンロードする権限がありません。");
  }

  const parsed = await parseJsonBody(req, documentBatchPdfSchema);
  if (!parsed.ok) return parsed.response;

  const { doc_ids } = parsed.data;

  try {
    // テナント境界の検証: 要求された id がすべて当該 tenant に属するか確認する。
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const uniqueIds = Array.from(new Set(doc_ids));
    const { data: owned, error: ownErr } = await admin
      .from("documents")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .in("id", uniqueIds);
    if (ownErr) return apiInternalError(ownErr, "POST /api/admin/documents/batch-pdf (ownership)");

    const ownedIds = (owned ?? []).map((d) => (d as { id: string }).id);
    if (ownedIds.length !== uniqueIds.length) {
      return apiNotFound("指定された帳票の一部が見つかりません。");
    }

    // 1 件だけなら ZIP にせず PDF を直接返す (最適化)。
    if (ownedIds.length === 1) {
      const rendered = await renderTenantDocumentPdfs(ownedIds, caller.tenantId);
      if (rendered.length === 0) return apiNotFound("帳票PDFを生成できませんでした。");
      const only = rendered[0];
      const res = new NextResponse(only.data as BodyInit, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${encodeURIComponent(only.filename)}"`,
        },
      });
      return applySecurityHeaders(res, { cacheControl: "private, no-store" });
    }

    const zip = await generateBatchDocumentZip(ownedIds, caller.tenantId);
    const filename = `documents_${new Date().toISOString().slice(0, 10)}.zip`;
    const res = new NextResponse(zip as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
    return applySecurityHeaders(res, { cacheControl: "private, no-store" });
  } catch (e) {
    if (e instanceof Error && e.message === "no_documents") {
      return apiNotFound("帳票PDFを生成できませんでした。");
    }
    return apiInternalError(e, "POST /api/admin/documents/batch-pdf");
  }
}
