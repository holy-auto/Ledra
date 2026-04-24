import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiOk } from "@/lib/api/response";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

type InventoryItemRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function toNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── GET: 在庫アイテム一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";
    const q = (url.searchParams.get("q") ?? "").trim();
    const lowStockOnly = url.searchParams.get("low_stock") === "true";

    let query = supabase
      .from("inventory_items")
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return apiValidationError("品目名は必須です");

    const row = {
      tenant_id: caller.tenantId,
      name,
      sku: String(body.sku ?? "").trim() || null,
      category: String(body.category ?? "").trim() || null,
      unit: String(body.unit ?? "").trim() || "個",
      current_stock: toNumber(body.current_stock, 0),
      min_stock: toNumber(body.min_stock, 0),
      unit_cost: toInt(body.unit_cost),
      note: String(body.note ?? "").trim() || null,
    };

    const { data, error } = await supabase
      .from("inventory_items")
      .insert(row)
      .select(
        "id, name, sku, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      // 一意制約違反（SKU 重複）
      if (typeof error.message === "string" && error.message.includes("uq_inventory_items_tenant_sku")) {
        return apiValidationError("同じ SKU の品目が既に存在します");
      }
      return apiInternalError(error, "inventory-items insert");
    }

    return apiJson({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory-items POST");
  }
}
