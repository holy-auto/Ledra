/**
 * DELETE /api/admin/customer-intakes/:id
 *
 * 招待を revoked にする (物理削除はしない. 監査ログを残す).
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { withCaller } from "@/lib/api/withCaller";
import { apiOk, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;

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
  },
  { permission: "customers:edit", rateLimit: "admin_write", routeName: "customer-intakes DELETE" },
);
