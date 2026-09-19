import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiNotFound, apiValidationError } from "@/lib/api/response";
import {
  getTenantFtJobDetail,
  validateTenantStatusTransition,
  updateTenantFtJobStatus,
} from "@/lib/fieldTest/tenantQueries";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/jobs/[id] — 案件詳細 */
export const GET = withCaller<{ id: string }>(
  async (_req: NextRequest, { caller, supabase, params }) => {
    const detail = await getTenantFtJobDetail(supabase, caller.tenantId, params.id);
    if (!detail) return apiNotFound("案件が見つかりません。");
    return apiJson(detail);
  },
  { routeName: "ft tenant job detail" },
);

/** PATCH /api/admin/field-test/jobs/[id] — ステータス更新 */
export const PATCH = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, supabase, params }) => {
    const body = await req.json();
    const newStatus = body.status as string | undefined;
    if (!newStatus) return apiValidationError("status は必須です。");

    // 現在のステータスを取得
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id, status")
      .eq("id", params.id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiNotFound("案件が見つかりません。");

    const err = validateTenantStatusTransition(job.status as string, newStatus);
    if (err) return apiValidationError(err);

    const updated = await updateTenantFtJobStatus(supabase, caller.tenantId, params.id, newStatus);

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
  },
  { routeName: "ft tenant job patch" },
);
