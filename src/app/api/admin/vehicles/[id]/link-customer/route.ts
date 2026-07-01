/**
 * PUT /api/admin/vehicles/[id]/link-customer
 *
 * 車両を顧客に手動で連携 / 連携解除する。顧客管理・車両管理の双方の画面から
 * 同じエンドポイントを叩く (車両の customer_id を張り替えるだけなので方向は不問)。
 *
 * Body:  { customer_id: uuid | null }  (null で連携解除)
 * 認証:  caller 必須 + role >= staff。車両・顧客ともに自テナント所属を検証。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効な顧客IDです。",
  });

const linkSchema = z.object({ customer_id: nullableUuid });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await params;
    if (!id) return apiValidationError("車両IDが必要です。");

    const parsed = linkSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const customerId = parsed.data.customer_id;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 車両が自テナント所属か確認。
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!vehicle) return apiNotFound("指定された車両が見つかりません。");

    // 連携先の顧客も自テナント所属か確認 (null=解除時は不要)。
    if (customerId) {
      const { data: customer } = await admin
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (!customer) return apiNotFound("指定された顧客が見つかりません。");
    }

    const { data: updated, error: updateErr } = await admin
      .from("vehicles")
      .update({ customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, customer_id, customer:customers(id, name)")
      .single();

    if (updateErr) return apiInternalError(updateErr, "vehicles link-customer PUT");

    return apiOk({ vehicle: updated });
  } catch (e) {
    return apiInternalError(e, "vehicles link-customer PUT");
  }
}
