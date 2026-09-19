import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { listTenantFtProjects } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/mobile/field-test/projects — 参加中 FT プロジェクト一覧 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const projects = await listTenantFtProjects(caller.supabase, caller.tenantId);
    return apiJson({ projects });
  } catch (e) {
    return apiInternalError(e, "mobile ft projects");
  }
}
