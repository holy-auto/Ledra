import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listTenantFtJobs } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/mobile/field-test/jobs?project_id=xxx — 自社案件一覧 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const projectId = request.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    const jobs = await listTenantFtJobs(caller.supabase, caller.tenantId, projectId);
    return apiJson({ jobs });
  } catch (e) {
    return apiInternalError(e, "mobile ft jobs");
  }
}
