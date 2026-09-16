/**
 * POST /api/admin/body-repair-jobs/[id]/track-link
 *
 * 車体整備案件の顧客向け進捗トラッキング URL を発行する (ガイドライン4.3 見える化)。
 * 既にトークンが発行済みなら再利用する (idempotent)。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { ensureBodyRepairTrackToken, TRACK_BASE_PATH } from "@/lib/bodyRepair/trackToken";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id: jobId } = params;
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) return apiValidationError("job_id が不正です");

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const token = await ensureBodyRepairTrackToken(admin, caller.tenantId, jobId);
      if (!token) return apiError({ code: "not_found", message: "案件が見つかりません", status: 404 });

      return apiOk({ track_url: `${TRACK_BASE_PATH}/${token}`, token });
    } catch (e) {
      return apiInternalError(e, "admin/body-repair-jobs/[id]/track-link");
    }
  },
  { minRole: "staff", routeName: "admin/body-repair-jobs/[id]/track-link" },
);
