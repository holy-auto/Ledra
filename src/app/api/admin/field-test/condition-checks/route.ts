import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listConditionChecks, upsertConditionCheck, conditionCheckInputSchema } from "@/lib/fieldTest/tenantQueries";

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
    const parsed = conditionCheckInputSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { job_id, condition_id, ...value } = parsed.data;

    // 自社案件であることを確認
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id, project_id")
      .eq("id", job_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    try {
      const check = await upsertConditionCheck(
        supabase,
        job_id,
        job.project_id as string,
        condition_id,
        value,
        caller.userId,
      );
      return apiJson(check);
    } catch (e) {
      if ((e as { code?: string })?.code === "FT_INVALID_CONDITION") {
        return apiValidationError((e as Error).message);
      }
      throw e;
    }
  },
  { routeName: "ft tenant condition-checks POST" },
);
