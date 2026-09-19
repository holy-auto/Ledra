import { withCaller } from "@/lib/api/withCaller";
import { apiJson } from "@/lib/api/response";
import { listTenantFtProjects } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/projects — 参加中 FT プロジェクト一覧 */
export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    const projects = await listTenantFtProjects(supabase, caller.tenantId);
    return apiJson({ projects });
  },
  { routeName: "ft tenant projects" },
);
