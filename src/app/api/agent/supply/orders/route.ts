/**
 * メーカーの受信トレイ: 自分宛ての全ポータル発注を全提携ショップ横断で一覧する。
 *
 * supply_partners は platform スコープ (テナント横断) のため、1 メーカーアカウントで
 * 全ショップの発注をまとめて見られる。RLS でも閲覧可だが、ショップ名 (tenants.name)
 * の表示にテナント横断の読み取りが要るため、partner をゲートしたうえで service-role で
 * 自分宛て (supply_partner_id = 自分) かつ transport='portal' に限定して取得する。
 */
import { NextResponse } from "next/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const admin = createServiceRoleAdmin("supply portal: メーカー受信トレイ (自分宛てポータル発注の横断一覧)");
    const { data, error } = await admin
      .from("purchase_orders")
      .select(
        "id, po_number, subtotal, status, partner_response, partner_ship_eta, created_at, tenant_id, tenants(name)",
      )
      .eq("supply_partner_id", gate.partnerId)
      .eq("transport", "portal")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return apiInternalError(error, "supply portal orders list");

    const orders = (data ?? []).map((o) => {
      const t = o.tenants as { name?: string | null } | { name?: string | null }[] | null;
      const shopName = Array.isArray(t) ? (t[0]?.name ?? null) : (t?.name ?? null);
      return {
        id: o.id,
        po_number: o.po_number,
        subtotal: o.subtotal,
        status: o.status,
        partner_response: o.partner_response ?? "pending",
        partner_ship_eta: o.partner_ship_eta,
        created_at: o.created_at,
        shop_name: shopName,
      };
    });
    return apiJson({ ok: true, orders });
  } catch (e: unknown) {
    return apiInternalError(e, "supply portal orders list");
  }
}
