import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { inventoryMovementCreateSchema } from "@/lib/validations/inventory";

export const dynamic = "force-dynamic";

// ─── GET: 入出庫履歴 (最新100件) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const itemId = url.searchParams.get("item_id");

    let query = supabase
      .from("inventory_movements")
      .select(
        "id, item_id, type, quantity, reason, reservation_id, created_by, created_at, inventory_items(name, unit)",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (itemId) query = query.eq("item_id", itemId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "inventory-movements list");

    return apiJson({ ok: true, movements: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-movements GET");
  }
}

// ─── POST: 入出庫を記録 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = inventoryMovementCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { item_id: itemId, type, quantity, reason, reservation_id: reservationId } = parsed.data;

    const { data, error } = await supabase.rpc("apply_inventory_movement", {
      p_item_id: itemId,
      p_type: type,
      p_quantity: quantity,
      p_reason: reason,
      p_reservation_id: reservationId ?? null,
    });

    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("item_not_found")) {
        return apiValidationError("対象の在庫アイテムが見つかりません");
      }
      if (msg.includes("invalid_type") || msg.includes("invalid_quantity")) {
        return apiValidationError("入力値が不正です");
      }
      return apiInternalError(error, "apply_inventory_movement");
    }

    return apiJson({ ok: true, result: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-movements POST");
  }
}
