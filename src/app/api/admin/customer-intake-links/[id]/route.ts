/**
 * DELETE /api/admin/customer-intake-links/:id
 *
 * 店舗用登録リンクを無効化する (is_active=false). 履歴は残すため物理削除しない.
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasPermission } from "@/lib/auth/permissions";
import { deactivateStoreLink } from "@/lib/identity/intakeLinkServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:create")) return apiForbidden();

  const { id } = await ctx.params;
  try {
    await deactivateStoreLink(caller.tenantId, id);
    return apiOk({ deactivated: true });
  } catch (err) {
    return apiInternalError(err, "DELETE /api/admin/customer-intake-links/[id]");
  }
}
