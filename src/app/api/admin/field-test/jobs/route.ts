import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listTenantFtJobs } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/jobs?project_id=xxx — 自社案件一覧 */
export const GET = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    const jobs = await listTenantFtJobs(supabase, caller.tenantId, projectId);
    return apiJson({ jobs });
  },
  { routeName: "ft tenant jobs" },
);
