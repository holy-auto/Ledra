/**
 * メーカー受信トレイの発注 1 件 (明細つき)。自分宛て & ポータル発注のみ。
 * 受信トレイ一覧と同じく、ショップ名表示のため partner ゲート後 service-role で取得する。
 */
import { NextResponse } from "next/server";
import { apiJson, apiNotFound, apiInternalError } from "@/lib/api/response";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const { id: poId } = await ctx.params;
    const admin = createServiceRoleAdmin("supply portal: メーカー向け発注詳細 (自分宛てポータル発注)");

    const { data: po, error } = await admin
      .from("purchase_orders")
      .select(
        "id, po_number, subtotal, status, supply_partner_id, transport, note, created_at, partner_response, partner_responded_at, partner_ship_eta, partner_tracking_no, partner_response_note, decline_reason, tenant_id, tenants(name)",
      )
      .eq("id", poId)
      .maybeSingle();
    if (error) return apiInternalError(error, "supply portal order detail");
    if (!po || po.supply_partner_id !== gate.partnerId || po.transport !== "portal") {
      return apiNotFound("発注が見つかりません。");
    }

    const { data: items, error: itemErr } = await admin
      .from("purchase_order_items")
      .select("id, name, sku, quantity, unit_cost, amount, accepted_quantity, backorder_quantity")
      .eq("po_id", poId)
      .order("created_at", { ascending: true });
    if (itemErr) return apiInternalError(itemErr, "supply portal order detail items");

    const t = po.tenants as { name?: string | null } | { name?: string | null }[] | null;
    const shopName = Array.isArray(t) ? (t[0]?.name ?? null) : (t?.name ?? null);

    return apiJson({
      ok: true,
      order: {
        id: po.id,
        po_number: po.po_number,
        subtotal: po.subtotal,
        status: po.status,
        note: po.note,
        created_at: po.created_at,
        shop_name: shopName,
        partner_response: po.partner_response ?? "pending",
        partner_responded_at: po.partner_responded_at,
        partner_ship_eta: po.partner_ship_eta,
        partner_tracking_no: po.partner_tracking_no,
        partner_response_note: po.partner_response_note,
        decline_reason: po.decline_reason,
        items: items ?? [],
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "supply portal order detail");
  }
}
