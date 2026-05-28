/**
 * GET /api/admin/customer-intakes/:id/duplicates
 *
 * 承認 UI で「同じ email/phone の既存顧客」を提示するためのヘルパー.
 * 提出された intake の連絡先と完全一致する customers を最大 5 件返す.
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getSubmittedIntake, findDuplicateCustomerCandidates } from "@/lib/identity/intakeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:view")) return apiForbidden();

  const { id } = await ctx.params;

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
}
