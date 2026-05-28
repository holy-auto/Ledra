/**
 * DELETE /api/admin/customer-intakes/:id
 *
 * 招待を revoked にする (物理削除はしない. 監査ログを残す).
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasPermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:edit")) return apiForbidden();

  const { id } = await ctx.params;

  const { admin } = createTenantScopedAdmin(caller.tenantId);
  const { data, error } = await admin
    .from("customer_intake_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", caller.tenantId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return apiInternalError(error, "DELETE /api/admin/customer-intakes/:id");
  if (!data) return apiNotFound("対象の招待が見つからないか、すでに完了/取消済みです");

  return apiOk({ id: data.id, status: "revoked" });
}
