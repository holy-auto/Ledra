import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

export const dynamic = "force-dynamic";

/**
 * 在庫アイテム CSV エクスポート
 *
 * 用途: 棚卸 / 会計連携 / 移行用バックアップ。
 * Excel が UTF-8 を正しく認識するよう BOM (﻿) を先頭に付ける。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase
      .from("inventory_items")
      .select(
        "name, sku, barcode, category, unit, current_stock, min_stock, unit_cost, note, is_active, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("name", { ascending: true });
    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "inventory-items export");

    const header = [
      "name",
      "sku",
      "barcode",
      "category",
      "unit",
      "current_stock",
      "min_stock",
      "unit_cost",
      "note",
      "is_active",
      "created_at",
      "updated_at",
    ];

    const rows = (data ?? []).map((r) => [
      r.name,
      r.sku,
      r.barcode,
      r.category,
      r.unit,
      r.current_stock,
      r.min_stock,
      r.unit_cost,
      r.note,
      r.is_active,
      r.created_at,
      r.updated_at,
    ]);

    const filename = `inventory_items_${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(buildCsv(header, rows), {
      status: 200,
      headers: csvDownloadHeaders(filename),
    });
  } catch (e) {
    return apiInternalError(e, "inventory-items export");
  }
}
