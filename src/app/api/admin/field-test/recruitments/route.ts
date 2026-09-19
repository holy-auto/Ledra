import { withCaller } from "@/lib/api/withCaller";
import { apiJson } from "@/lib/api/response";
import { listOpenRecruitments } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/recruitments — 公開中の募集一覧 */
export const GET = withCaller(
  async (_req, { supabase }) => {
    const recruitments = await listOpenRecruitments(supabase);
    return apiJson({ recruitments });
  },
  { routeName: "ft tenant recruitments" },
);
