import { NextRequest, after } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { acceptAgreement } from "@/lib/fieldTest/tenantQueries";
import { notifyAgreementAccepted } from "@/lib/fieldTest/agreementNotify";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/field-test/agreements/[id] — 同意 */
export const PATCH = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, supabase, params }) => {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "accept") {
      return apiValidationError('action は "accept" のみ対応しています。');
    }

    let result;
    try {
      result = await acceptAgreement(supabase, caller.tenantId, params.id, caller.userId);
    } catch (e) {
      if ((e as { code?: string })?.code === "FT_STATE_CONFLICT") return apiValidationError((e as Error).message);
      throw e;
    }

    // 同意した施工店自身への控え（DECISION_LOG 2026-10-06）。
    after(() => notifyAgreementAccepted(caller.tenantId, result.agreement_type));

    return apiJson(result);
  },
  { routeName: "ft tenant agreement accept" },
);
