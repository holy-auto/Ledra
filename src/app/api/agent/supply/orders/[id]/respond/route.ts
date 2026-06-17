/**
 * メーカーがポータルで発注に回答する (受注 / 一部欠品 / 辞退) — 代理店アカウント統合版。
 *
 * 壁3 / source of truth 保護:
 *   - 回答列 (partner_response 等) は guard トリガで tenant/クライアント直叩きを差し戻すため、
 *     書き込みは service-role でのみ行う (本ルート)。
 *   - 数量整合 (受注 ≤ 発注 / 負数禁止 / 全数 0 は辞退) は computePortalResponse(純関数)で担保。
 *   - 発注明細は発注書の確定値を source of truth とし、body の item_id をそれに突合する
 *     (メーカーが行や数量を捏造できない)。
 */
import { NextRequest, NextResponse } from "next/server";
import { apiJson, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { supplyPortalRespondSchema } from "@/lib/supply/validation";
import { computePortalResponse, type PortalResponseLineInput } from "@/lib/supply/portalResponse";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireActiveSupplyPartner();
    if (gate instanceof NextResponse) return gate;

    const { id: poId } = await ctx.params;
    const parsed = await parseJsonBody(req, supplyPortalRespondSchema);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;

    const admin = createServiceRoleAdmin("supply portal: メーカーの発注回答を反映 (service-role で回答列を書込)");

    // 自分宛て & ポータル発注 & 回答可能な状態か検証。
    const { data: po, error: poErr } = await admin
      .from("purchase_orders")
      .select("id, supply_partner_id, transport, status")
      .eq("id", poId)
      .maybeSingle();
    if (poErr) return apiInternalError(poErr, "supply portal respond load");
    if (!po || po.supply_partner_id !== gate.partnerId || po.transport !== "portal") {
      return apiNotFound("発注が見つかりません。");
    }
    if (po.status !== "sent") {
      return apiValidationError("この発注は現在回答できる状態ではありません。");
    }

    // 明細 (発注書の確定値) を source of truth として読む。
    const { data: items, error: itemErr } = await admin
      .from("purchase_order_items")
      .select("id, quantity")
      .eq("po_id", poId);
    if (itemErr) return apiInternalError(itemErr, "supply portal respond items");
    if (!items || items.length === 0) return apiValidationError("明細のない発注には回答できません。");

    // body の受注数量を item_id で突合 (未指定行は全量受注扱い)。
    const acceptedById = new Map<string, number | null | undefined>();
    for (const l of input.lines ?? []) acceptedById.set(l.item_id, l.accepted_quantity);
    const lineInputs: PortalResponseLineInput[] = items.map((it) => ({
      itemId: it.id as string,
      orderedQuantity: Number(it.quantity),
      acceptedQuantity: acceptedById.get(it.id as string),
    }));

    const decision = computePortalResponse({
      action: input.action,
      lines: lineInputs,
      declineReason: input.decline_reason ?? null,
    });
    if (!decision.ok) {
      return apiValidationError("回答内容を確認してください。", { reason: decision.reason });
    }

    // 回答列を更新 (guard トリガを通すため service-role)。
    const { error: updErr } = await admin
      .from("purchase_orders")
      .update({
        partner_response: decision.response,
        partner_responded_at: new Date().toISOString(),
        partner_ship_eta: input.action === "decline" ? null : (input.ship_eta ?? null),
        partner_tracking_no: input.action === "decline" ? null : (input.tracking_no ?? null),
        partner_response_note: input.note ?? null,
        decline_reason: decision.declineReason,
      })
      .eq("id", poId)
      .eq("supply_partner_id", gate.partnerId);
    if (updErr) return apiInternalError(updErr, "supply portal respond update");

    // 行ごとの受注/欠品数量を反映。
    for (const line of decision.lines) {
      const { error: lineErr } = await admin
        .from("purchase_order_items")
        .update({ accepted_quantity: line.acceptedQuantity, backorder_quantity: line.backorderQuantity })
        .eq("id", line.itemId)
        .eq("po_id", poId);
      if (lineErr) {
        logger.warn("[supply portal respond] item update failed", { poId, itemId: line.itemId, err: lineErr.message });
      }
    }

    logger.info("[supply portal respond] recorded", {
      poId,
      partnerId: gate.partnerId,
      response: decision.response,
      totalBackorder: decision.totalBackorder,
    });
    return apiJson({ ok: true, response: decision.response });
  } catch (e: unknown) {
    return apiInternalError(e, "supply portal respond");
  }
}
