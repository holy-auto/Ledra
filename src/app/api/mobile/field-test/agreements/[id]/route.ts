import { NextRequest, after } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { acceptAgreement } from "@/lib/fieldTest/tenantQueries";
import { notifyAgreementAccepted } from "@/lib/fieldTest/agreementNotify";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "accept") {
      return apiValidationError('action は "accept" のみ対応しています。');
    }

    const result = await acceptAgreement(caller.supabase, caller.tenantId, id, caller.userId);

    // 同意した施工店自身への控え（DECISION_LOG 2026-10-06）。
    after(() => notifyAgreementAccepted(caller.tenantId, result.agreement_type));

    return apiJson(result);
  } catch (e) {
    if ((e as { code?: string })?.code === "FT_STATE_CONFLICT") return apiValidationError((e as Error).message);
    return apiInternalError(e, "mobile ft agreement accept");
  }
}
