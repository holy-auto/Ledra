import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { listOpenRecruitments } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const recruitments = await listOpenRecruitments(caller.supabase);
    return apiJson({ recruitments });
  } catch (e) {
    return apiInternalError(e, "mobile ft recruitments");
  }
}
