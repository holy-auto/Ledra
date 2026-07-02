/**
 * POST /api/admin/body-repair-jobs/[id]/track-link
 *
 * 車体整備案件の顧客向け進捗トラッキング URL を発行する (ガイドライン4.3 見える化)。
 * 既にトークンが発行済みなら再利用する (idempotent)。
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { ensureBodyRepairTrackToken, TRACK_BASE_PATH } from "@/lib/bodyRepair/trackToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id: jobId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return apiValidationError("job_id が不正です");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const token = await ensureBodyRepairTrackToken(admin, caller.tenantId, jobId);
    if (!token) return apiError({ code: "not_found", message: "案件が見つかりません", status: 404 });

    return apiOk({ track_url: `${TRACK_BASE_PATH}/${token}`, token });
  } catch (e) {
    return apiInternalError(e, "admin/body-repair-jobs/[id]/track-link");
  }
}
