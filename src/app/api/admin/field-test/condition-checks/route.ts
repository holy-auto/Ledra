import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listConditionChecks, upsertConditionCheck } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/condition-checks?job_id=xxx */
export const GET = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) return apiValidationError("job_id は必須です。");

    // 自社案件であることを確認
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const checks = await listConditionChecks(supabase, jobId);
    return apiJson({ checks });
  },
  { routeName: "ft tenant condition-checks GET" },
);

/** POST /api/admin/field-test/condition-checks — 条件チェック記録 */
export const POST = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const body = await req.json();
    const { job_id, condition_id, value_boolean, value_numeric, value_text, value_photo_path } = body;

    if (!job_id || !condition_id) {
      return apiValidationError("job_id と condition_id は必須です。");
    }

    // 自社案件であることを確認
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", job_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const check = await upsertConditionCheck(
      supabase,
      job_id,
      condition_id,
      { value_boolean, value_numeric, value_text, value_photo_path },
      caller.userId,
    );
    return apiJson(check);
  },
  { routeName: "ft tenant condition-checks POST" },
);
