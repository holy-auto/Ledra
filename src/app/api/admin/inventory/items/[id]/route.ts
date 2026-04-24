import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiNotFound } from "@/lib/api/response";
import { inventoryItemUpdateSchema } from "@/lib/validations/inventory";

export const dynamic = "force-dynamic";

// ─── GET: 個別取得 (履歴含む) ───
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

    const { data: item, error } = await supabase
      .from("inventory_items")
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (error) return apiInternalError(error, "inventory-item get");
    if (!item) return apiNotFound();

    const { data: movements } = await supabase
      .from("inventory_movements")
      .select("id, type, quantity, reason, reservation_id, created_by, created_at")
      .eq("tenant_id", caller.tenantId)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return apiJson({ ok: true, item, movements: movements ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item GET");
  }
}

// ─── PUT: 更新 ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const parsed = inventoryItemUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    // current_stock は zod スキーマに含めず、apply_inventory_movement 経由のみ許可
    // (監査証跡のため)。
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updates[k] = v;
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      if (typeof error.message === "string" && error.message.includes("uq_inventory_items_tenant_sku")) {
        return apiValidationError("同じ SKU の品目が既に存在します");
      }
      return apiInternalError(error, "inventory-item update");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item PUT");
  }
}

// ─── DELETE: 論理削除 (is_active=false) ───
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

    const { error } = await supabase
      .from("inventory_items")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "inventory-item delete");

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-item DELETE");
  }
}
