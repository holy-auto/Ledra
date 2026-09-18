import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listConditionChecks, upsertConditionCheck } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/mobile/field-test/condition-checks?job_id=xxx */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) return apiValidationError("job_id は必須です。");

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const checks = await listConditionChecks(caller.supabase, jobId);
    return apiJson({ checks });
  } catch (e) {
    return apiInternalError(e, "mobile ft condition-checks GET");
  }
}

/** POST /api/mobile/field-test/condition-checks */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const body = await request.json();
    const { job_id, condition_id, value_boolean, value_numeric, value_text, value_photo_path } = body;

    if (!job_id || !condition_id) {
      return apiValidationError("job_id と condition_id は必須です。");
    }

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", job_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const check = await upsertConditionCheck(
      caller.supabase,
      job_id,
      condition_id,
      { value_boolean, value_numeric, value_text, value_photo_path },
      caller.userId,
    );
    return apiJson(check);
  } catch (e) {
    return apiInternalError(e, "mobile ft condition-checks POST");
  }
}
