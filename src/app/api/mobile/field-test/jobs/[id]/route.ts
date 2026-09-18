import { NextRequest, after } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import {
  apiJson,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import {
  getTenantFtJobDetail,
  validateTenantStatusTransition,
  updateTenantFtJobStatus,
} from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

/** GET /api/mobile/field-test/jobs/[id] — 案件詳細 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const detail = await getTenantFtJobDetail(caller.supabase, caller.tenantId, id);
    if (!detail) return apiNotFound("案件が見つかりません。");
    return apiJson(detail);
  } catch (e) {
    return apiInternalError(e, "mobile ft job detail");
  }
}

/** PATCH /api/mobile/field-test/jobs/[id] — ステータス更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = await request.json();
    const newStatus = body.status as string | undefined;
    if (!newStatus) return apiValidationError("status は必須です。");

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiNotFound("案件が見つかりません。");

    const err = validateTenantStatusTransition(job.status as string, newStatus);
    if (err) return apiValidationError(err);

    const updated = await updateTenantFtJobStatus(caller.supabase, caller.tenantId, id, newStatus);

    if (newStatus === "evidence_submitted") {
      after(async () => {
        await notifyFtTenant({
          tenantId: caller.tenantId,
          type: "ft_evidence_submitted",
          title: "証拠が提出されました",
          body: `案件の証拠が提出されました。`,
          linkPath: `/admin/field-test`,
        });
      });
    }

    return apiJson(updated);
  } catch (e) {
    return apiInternalError(e, "mobile ft job patch");
  }
}
