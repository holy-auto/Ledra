import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listTrainingWithCompletions } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/training?project_id=xxx */
export const GET = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    // テナントがこのプロジェクトの案件を持つか確認
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("tenant_id", caller.tenantId)
      .limit(1)
      .maybeSingle();
    if (!job) return apiValidationError("プロジェクトが見つかりません。");

    const modules = await listTrainingWithCompletions(supabase, caller.tenantId, projectId);
    return apiJson({ modules });
  },
  { routeName: "ft tenant training GET" },
);
