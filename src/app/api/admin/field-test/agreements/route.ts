import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listTenantAgreements } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/agreements?project_id=xxx */
export const GET = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) return apiValidationError("project_id は必須です。");

    const agreements = await listTenantAgreements(supabase, caller.tenantId, projectId);
    return apiJson({ agreements });
  },
  { routeName: "ft tenant agreements GET" },
);
