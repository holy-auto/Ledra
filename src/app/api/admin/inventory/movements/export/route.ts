import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

export const dynamic = "force-dynamic";

/**
 * 在庫入出庫履歴 CSV エクスポート
 *
 * 監査・棚卸差異追跡用。デフォルトは直近 5000 件。
 * `?item_id=...` で特定アイテムに絞り込み可能。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const itemId = url.searchParams.get("item_id");

    let query = supabase
      .from("inventory_movements")
      .select("id, type, quantity, reason, reservation_id, created_at, inventory_items(name, sku, unit)")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (itemId) query = query.eq("item_id", itemId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "inventory-movements export");

    const header = [
      "created_at",
      "type",
      "item_name",
      "item_sku",
      "quantity",
      "unit",
      "reason",
      "reservation_id",
      "movement_id",
    ];

    const rows = (data ?? []).map((r) => {
      const item = (r as { inventory_items?: { name?: string; sku?: string; unit?: string } }).inventory_items;
      return [
        r.created_at,
        r.type,
        item?.name ?? "",
        item?.sku ?? "",
        r.quantity,
        item?.unit ?? "",
        r.reason,
        r.reservation_id,
        r.id,
      ];
    });

    const filename = `inventory_movements_${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(buildCsv(header, rows), {
      status: 200,
      headers: csvDownloadHeaders(filename),
    });
  } catch (e) {
    return apiInternalError(e, "inventory-movements export");
  }
}
