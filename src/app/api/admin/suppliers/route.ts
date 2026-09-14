/**
 * 仕入先マスタ CRUD。
 *
 * 発注 (purchase_orders) と在庫品目 (inventory_items.supplier_id) から参照される。
 * auto-action `inventory.auto_draft_reorder` が発注ドラフトを起票するには、品目に
 * 仕入先が紐づいている必要がある。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { enforceBilling } from "@/lib/billing/guard";

export const dynamic = "force-dynamic";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "仕入先名は必須です。").max(120),
  email: z.string().trim().email("メールアドレスの形式が不正です。").max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  lead_time_days: z.coerce.number().int().min(0).max(365).nullable().optional(),
  is_active: z.boolean().default(true),
});

const updateSchema = supplierSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, email, phone, note, lead_time_days, is_active, updated_at")
      .eq("tenant_id", caller.tenantId)
      .order("name");
    if (error) return apiInternalError(error, "suppliers list");
    return apiJson({ ok: true, suppliers: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "suppliers list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 仕入先マスタの変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "starter",
      action: "supplier_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = supplierSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { data, error } = await supabase
      .from("suppliers")
      .insert({ ...parsed.data, tenant_id: caller.tenantId })
      .select("id")
      .single();
    if (error) return apiInternalError(error, "supplier create");
    return apiJson({ ok: true, id: data.id });
  } catch (e: unknown) {
    return apiInternalError(e, "supplier create");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 仕入先マスタの変更は admin 以上 (代表判断 2026-09-01)
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { id, ...rest } = parsed.data;

    const updates: Record<string, unknown> = { ...rest };
    for (const k of Object.keys(updates)) if (updates[k] === undefined) delete updates[k];

    const { error } = await supabase.from("suppliers").update(updates).eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "supplier update");
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "supplier update");
  }
}
