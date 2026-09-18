import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { withdrawApplication } from "@/lib/fieldTest/tenantQueries";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = await request.json();
    if (body.action !== "withdraw") {
      return apiValidationError('action は "withdraw" のみ対応しています。');
    }

    const result = await withdrawApplication(caller.supabase, caller.tenantId, id);
    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "mobile ft application withdraw");
  }
}
