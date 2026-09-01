import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
  apiOk,
  apiForbidden,
} from "@/lib/api/response";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { inventoryItemCreateSchema } from "@/lib/validations/inventory";

export const dynamic = "force-dynamic";

type InventoryItemRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  supply_partner_product_id: string | null;
  supplier_sku: string | null;
};

// ─── GET: 在庫アイテム一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";
    const q = (url.searchParams.get("q") ?? "").trim();
    const barcode = (url.searchParams.get("barcode") ?? "").trim();
    const lowStockOnly = url.searchParams.get("low_stock") === "true";

    let query = supabase
      .from("inventory_items")
      .select(
        "id, name, sku, barcode, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at, supply_partner_product_id, supplier_sku",
      )
      .eq("tenant_id", caller.tenantId)
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);
    // カメラスキャン用の完全一致ルックアップ (一意なので 0/1 件)。
    if (barcode) query = query.eq("barcode", barcode);
    if (q) {
      const sq = escapePostgrestValue(escapeIlike(q));
      query = query.or(`name.ilike.%${sq}%,sku.ilike.%${sq}%,category.ilike.%${sq}%`);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "inventory-items list");

    const items = (data ?? []) as InventoryItemRow[];
    const lowStock = items.filter((i) => Number(i.current_stock) <= Number(i.min_stock) && Number(i.min_stock) > 0);

    const filteredItems = lowStockOnly ? lowStock : items;

    const totalValue = items.reduce((sum, i) => sum + (i.unit_cost ?? 0) * Number(i.current_stock), 0);

    return apiOk({
      items: filteredItems,
      stats: {
        total: items.length,
        low_stock_count: lowStock.length,
        total_value: totalValue,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-items GET");
  }
}

// ─── POST: アイテム作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "menu_items:manage")) return apiForbidden();

    const parsed = inventoryItemCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row = {
      tenant_id: caller.tenantId,
      ...parsed.data,
    };

    const { data, error } = await supabase
      .from("inventory_items")
      .insert(row)
      .select(
        "id, name, sku, barcode, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      // 一意制約違反（SKU 重複）
      if (typeof error.message === "string" && error.message.includes("uq_inventory_items_tenant_sku")) {
        return apiValidationError("同じ SKU の品目が既に存在します");
      }
      // 一意制約違反（バーコード重複）
      if (typeof error.message === "string" && error.message.includes("uq_inventory_items_tenant_barcode")) {
        return apiValidationError("このバーコードは既に別の品目に登録されています");
      }
      return apiInternalError(error, "inventory-items insert");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-items POST");
  }
}
