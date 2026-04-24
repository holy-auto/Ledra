import { parseJsonSafe } from "@/lib/api/safeJson";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { enforceBilling } from "@/lib/billing/guard";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiOk,
  apiUnauthorized,
  apiValidationError,
  apiForbidden,
  apiInternalError,
} from "@/lib/api/response";
import { enqueueBatchPdf } from "@/lib/qstash/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 100;

/**
 * GET /api/admin/certificates/batch-pdf?job_id=xxx
 * ジョブの進捗を返す（フロントエンドのポーリング用）
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) return apiValidationError("job_id は必須です。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: job, error } = await admin
      .from("batch_pdf_jobs")
      .select("id, status, total_count, processed_count, result_urls, error_message, created_at, updated_at")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (error || !job) return apiValidationError("ジョブが見つかりません。");

    return apiOk(job);
  } catch (e) {
    return apiInternalError(e, "admin/certificates/batch-pdf GET");
  }
}

/**
 * POST /api/admin/certificates/batch-pdf
 * Body: { public_ids: string[] }   (max 100)
 *
 * ジョブを作成して QStash にキューイング。job_id を即座に返す。
 * 進捗は GET エンドポイントをポーリングして確認。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("この操作を行う権限がありません。");
    }

    const billingDeny = await enforceBilling(req, {
      minPlan: "starter",
      action: "batch_pdf",
      tenantId: caller.tenantId,
    });
    if (billingDeny) return billingDeny;

    const body = await parseJsonSafe(req);
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

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: job, error: jobErr } = await admin
      .from("batch_pdf_jobs")
      .insert({
        tenant_id: caller.tenantId,
        status: "queued",
        public_ids: ids,
        total_count: ids.length,
        processed_count: 0,
      })
      .select("id")
      .single();

    if (jobErr) return apiInternalError(jobErr, "admin/certificates/batch-pdf job create");

    await enqueueBatchPdf({
      job_id: job.id,
      tenant_id: caller.tenantId,
      public_ids: ids,
    });

    console.info(`[batch-pdf] tenant=${caller.tenantId} queued job=${job.id} count=${ids.length}`);

    return apiJson(
      {
        ok: true,
        message: `${ids.length}件のPDF生成を開始しました`,
        job_id: job.id,
      },
      { status: 200 },
    );
  } catch (e) {
    return apiInternalError(e, "admin/certificates/batch-pdf POST");
  }
}
