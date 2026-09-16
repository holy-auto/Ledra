/**
 * GET /api/admin/customer-intakes/:id/duplicates
 *
 * 承認 UI で「同じ email/phone の既存顧客」を提示するためのヘルパー.
 * 提出された intake の連絡先と完全一致する customers を最大 5 件返す.
 */
import { withCaller } from "@/lib/api/withCaller";
import { apiOk, apiNotFound, apiInternalError } from "@/lib/api/response";
import { getSubmittedIntake, findDuplicateCustomerCandidates } from "@/lib/identity/intakeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;

    try {
      const intake = await getSubmittedIntake(caller.tenantId, id);
      if (!intake) return apiNotFound("確認待ちの招待が見つかりません");

      const candidates = await findDuplicateCustomerCandidates(caller.tenantId, {
        email: intake.fields.email,
        phone: intake.fields.phone,
      });

      return apiOk({ candidates });
    } catch (err) {
      return apiInternalError(err, "GET /api/admin/customer-intakes/:id/duplicates");
    }
  },
  { permission: "customers:view", rateLimit: "general", routeName: "customer-intakes duplicates GET" },
);
