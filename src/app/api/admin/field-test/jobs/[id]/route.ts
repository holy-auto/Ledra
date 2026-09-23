import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiNotFound, apiValidationError } from "@/lib/api/response";
import {
  getTenantFtJobDetail,
  validateTenantStatusTransition,
  updateTenantFtJobStatus,
} from "@/lib/fieldTest/tenantQueries";
import { notifyFtManufacturer } from "@/lib/fieldTest/ftNotify";

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
    const body = await req.json().catch(() => ({}));
    const newStatus = body.status as string | undefined;
    if (!newStatus) return apiValidationError("status は必須です。");

    // 現在のステータス＋メーカー宛通知に要る manufacturer_id / project_id を取得
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id, status, manufacturer_id, project_id")
      .eq("id", params.id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiNotFound("案件が見つかりません。");

    const err = validateTenantStatusTransition(job.status as string, newStatus);
    if (err) return apiValidationError(err);

    let updated;
    try {
      updated = await updateTenantFtJobStatus(supabase, caller.tenantId, params.id, job.status as string, newStatus);
    } catch (e) {
      if ((e as { code?: string })?.code === "FT_STATE_CONFLICT") return apiValidationError((e as Error).message);
      throw e;
    }

    if (newStatus === "evidence_submitted") {
      // 提出後に次に動くのは検査するメーカー。提出元テナント自身ではなくメーカーへ届ける。
      after(async () => {
        await notifyFtManufacturer({
          manufacturerId: job.manufacturer_id as string,
          type: "ft_evidence_submitted",
          title: "証拠が提出されました",
          body: `施工店から案件の証拠が提出されました。検査してください。`,
          linkPath: `/manufacturer/field-test/${job.project_id as string}`,
        });
      });
    }

    return apiJson(updated);
  },
  { routeName: "ft tenant job patch" },
);
