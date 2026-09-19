import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listTenantAgreements } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const projectId = request.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    const agreements = await listTenantAgreements(caller.supabase, caller.tenantId, projectId);
    return apiJson({ agreements });
  } catch (e) {
    return apiInternalError(e, "mobile ft agreements GET");
  }
}
