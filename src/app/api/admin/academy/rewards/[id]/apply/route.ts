/**
 * POST /api/admin/academy/rewards/[id]/apply
 * Stripe Customer Balance に credit を適用する (super_admin のみ)
 */

import { apiOk, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";
import { applyStripeCredit } from "@/lib/academy/rewards";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const POST = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      if (caller.role !== "super_admin") return apiForbidden("super_admin のみ実行できます");

      const { id } = params;
      const result = await applyStripeCredit(id);

      if (!result.ok) {
        if (result.reason === "not_found") return apiNotFound("報酬レコードが見つかりません");
        if (result.reason === "already_applied") return apiOk({ already_applied: true });
        if (result.reason === "no_stripe_customer") {
          return apiOk({ skipped: true, detail: result.detail ?? "stripe_customer_id なし" });
        }
        return apiInternalError(new Error(result.detail ?? result.reason));
      }

      return apiOk({ stripe_credit_id: result.stripe_credit_id });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { routeName: "admin/academy/rewards/[id]/apply POST" },
);
