import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { getRecruitmentDetail } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const detail = await getRecruitmentDetail(caller.supabase, id);
    if (!detail) return apiNotFound("募集が見つかりません。");
    return apiJson(detail);
  } catch (e) {
    return apiInternalError(e, "mobile ft recruitment detail");
  }
}
