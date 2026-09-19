import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiNotFound } from "@/lib/api/response";
import { getRecruitmentDetail } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

/** GET /api/admin/field-test/recruitments/[id] — 募集詳細 */
export const GET = withCaller<{ id: string }>(
  async (_req: NextRequest, { supabase, params }) => {
    const detail = await getRecruitmentDetail(supabase, params.id);
    if (!detail) return apiNotFound("募集が見つかりません。");
    return apiJson(detail);
  },
  { routeName: "ft tenant recruitment detail" },
);
