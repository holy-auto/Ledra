import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listTrainingWithCompletions } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const projectId = request.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("tenant_id", caller.tenantId)
      .limit(1)
      .maybeSingle();
    if (!job) return apiValidationError("プロジェクトが見つかりません。");

    const modules = await listTrainingWithCompletions(caller.supabase, caller.tenantId, projectId);
    return apiJson({ modules });
  } catch (e) {
    return apiInternalError(e, "mobile ft training GET");
  }
}
