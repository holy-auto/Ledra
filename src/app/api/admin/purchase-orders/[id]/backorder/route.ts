/**
 * 欠品分の再発注 — ポータルで一部欠品 (partial) 回答を受けた発注の差分を、新しい
 * 発注ドラフトとして起票する。仕入先は未割当 (店舗が選んで送信)。壁3: 作るのは draft のみ。
 *
 * 元発注の各明細の backorder_quantity (= 発注 − 受注) を数量とした明細を持つ draft を作る。
 * 欠品が無ければ 400。仕入先・送信は人が行う (本ルートは下書き作成まで)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function makePoNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `PO-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await ctx.params;

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select(
        "id, po_number, partner_response, purchase_order_items(item_id, name, sku, quantity, unit_cost, backorder_quantity)",
      )
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (poErr) return apiInternalError(poErr, "backorder reorder fetch");
    if (!po) return apiNotFound("purchase order not found");

    const items = (po.purchase_order_items ?? []) as Array<{
      item_id: string | null;
      name: string;
      sku: string | null;
      quantity: number;
      unit_cost: number | null;
      backorder_quantity: number | null;
    }>;

    // 欠品 (backorder_quantity > 0) のある明細だけを再発注対象にする。
    const shortfall = items
      .map((it) => ({ ...it, backorder: it.backorder_quantity != null ? Number(it.backorder_quantity) : 0 }))
      .filter((it) => it.backorder > 0);
    if (shortfall.length === 0) {
      return apiValidationError("欠品分がありません。");
    }

    const lines = shortfall.map((it) => {
      const unitCost = it.unit_cost != null ? Number(it.unit_cost) : null;
      const amount = unitCost != null ? Math.round(unitCost * it.backorder) : 0;
      return {
        item_id: it.item_id,
        name: it.name,
        sku: it.sku,
        quantity: it.backorder,
        unit_cost: unitCost,
        amount,
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);

    const { data: created, error: createErr } = await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: caller.tenantId,
        po_number: makePoNumber(),
        status: "draft",
        source: "manual",
        note: `欠品分の再発注（元発注 ${po.po_number ?? id}）。仕入先を選んで送信してください。`,
        subtotal,
        created_by: caller.userId,
      })
      .select("id")
      .single();
    if (createErr || !created) return apiInternalError(createErr, "backorder reorder create");

    const itemRows = lines.map((l) => ({
      tenant_id: caller.tenantId,
      po_id: created.id,
      item_id: l.item_id,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      amount: l.amount,
    }));
    const { error: itemErr } = await supabase.from("purchase_order_items").insert(itemRows);
    if (itemErr) {
      await supabase.from("purchase_orders").delete().eq("id", created.id).eq("tenant_id", caller.tenantId);
      return apiInternalError(itemErr, "backorder reorder items");
    }

    return apiJson({ ok: true, id: created.id, lines: lines.length });
  } catch (e: unknown) {
    return apiInternalError(e, "backorder reorder");
  }
}
