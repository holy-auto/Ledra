import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { completeTrainingModule } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const body = await request.json();
    const { module_id } = body;
    if (!module_id) return apiValidationError("module_id は必須です。");

    const { data: mod } = await caller.supabase
      .from("ft_training_modules")
      .select("id, project_id")
      .eq("id", module_id)
      .maybeSingle();
    if (!mod) return apiValidationError("教育モジュールが見つかりません。");

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id")
      .eq("project_id", mod.project_id as string)
      .eq("tenant_id", caller.tenantId)
      .limit(1)
      .maybeSingle();
    if (!job) return apiValidationError("このモジュールへのアクセス権がありません。");

    const completion = await completeTrainingModule(caller.supabase, caller.tenantId, module_id, caller.userId);
    return apiJson(completion);
  } catch (e) {
    return apiInternalError(e, "mobile ft training completion POST");
  }
}
