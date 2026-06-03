import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

    const lines: string[] = [header.join(",")];
    for (const r of data ?? []) {
      lines.push(
        [
          csvEscape(r.name),
          csvEscape(r.sku),
          csvEscape(r.barcode),
          csvEscape(r.category),
          csvEscape(r.unit),
          csvEscape(r.current_stock),
          csvEscape(r.min_stock),
          csvEscape(r.unit_cost),
          csvEscape(r.note),
          csvEscape(r.is_active),
          csvEscape(r.created_at),
          csvEscape(r.updated_at),
        ].join(","),
      );
    }

    const filename = `inventory_items_${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse("﻿" + lines.join("\r\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiInternalError(e, "inventory-items export");
  }
}
