import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { completeTrainingModule } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** POST /api/admin/field-test/training/completions — 受講完了記録 */
export const POST = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const body = await req.json();
    const { module_id } = body;
    if (!module_id) return apiValidationError("module_id は必須です。");

    // モジュールが自テナントの参加プロジェクトに属するか確認
    const { data: mod } = await supabase
      .from("ft_training_modules")
      .select("id, project_id")
      .eq("id", module_id)
      .maybeSingle();
    if (!mod) return apiValidationError("教育モジュールが見つかりません。");

    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id")
      .eq("project_id", mod.project_id as string)
      .eq("tenant_id", caller.tenantId)
      .limit(1)
      .maybeSingle();
    if (!job) return apiValidationError("このモジュールへのアクセス権がありません。");

    const completion = await completeTrainingModule(supabase, caller.tenantId, module_id, caller.userId);
    return apiJson(completion);
  },
  { routeName: "ft tenant training completion POST" },
);
