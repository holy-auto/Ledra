/**
 * 供給パートナー向けの発注ドラフト自動起票 (IO 層)。reorderAuto.ts の供給パートナー版。
 *
 * 在庫下限割れ + 供給パートナー商材に紐付け済み (inventory_items.supply_partner_product_id)
 * の品目について、提携中パートナーの中から調達先を選定 (reorderSelection) し、
 * パートナーごとに発注書を draft/auto で起票する。
 *
 * - #2 店舗別卸値上書き: tenant_supply_links.price_overrides を実効卸値に反映。
 * - #3 優先度選定: 同一 SKU を複数パートナーが扱う場合は priority→価格→リードタイムで選ぶ。
 *
 * 壁3: 作るのは draft のみ。承認・送信 (金額の外部コミット) は人 (auto-send は別 opt-in)。
 * 日次 cron から呼ばれ、絶対に throw しない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { computeReorderQuantity } from "@/lib/inventory/reorder";
import { selectSourcingOption, effectiveUnitPrice, type PartnerSourcingOption } from "@/lib/supply/reorderSelection";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { shouldAutoDraftReorder } from "@/lib/ai/automation/orchestrator";

export interface MaybeAutoDraftPartnerReordersResult {
  created: number;
  skipped: number;
}

function makePoNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `PO-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function isMissingTableOrColumn(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(err.code ?? "")) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

type ItemRow = {
  id: string;
  name: string;
  supplier_sku: string | null;
  reorder_qty: number | null;
  current_stock: number;
  min_stock: number;
};

/** price_overrides (sku -> price) から SKU の上書き値を安全に取り出す。 */
function readOverride(overrides: unknown, sku: string): number | null {
  if (!overrides || typeof overrides !== "object") return null;
  const v = (overrides as Record<string, unknown>)[sku];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * テナントの低在庫 (供給パートナー紐付け) 品目から、パートナーごとの発注書ドラフトを起票する。
 * 失敗しても投げない。
 */
export async function maybeAutoDraftPartnerReordersForTenant(
  tenantId: string,
): Promise<MaybeAutoDraftPartnerReordersResult> {
  const result: MaybeAutoDraftPartnerReordersResult = { created: 0, skipped: 0 };
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDraftReorder(settings)) return result;

    const admin = createServiceRoleAdmin("AI auto-draft (supply partner) reorder — low-stock cron, per tenant");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return result;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_pos_deduction")) return result;

    // 供給パートナー商材に紐付け済みの低在庫候補。
    const sel = await admin
      .from("inventory_items")
      .select("id, name, supplier_sku, reorder_qty, current_stock, min_stock")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .not("supply_partner_product_id", "is", null)
      .gt("min_stock", 0);
    if (sel.error) {
      if (!isMissingTableOrColumn(sel.error)) {
        logger.warn("[partnerReorder] inventory select failed", { tenantId, err: sel.error.message });
      }
      return result;
    }
    const lowStock = (sel.data ?? []).filter(
      (r) => r.supplier_sku && Number(r.current_stock) <= Number(r.min_stock),
    ) as ItemRow[];
    if (lowStock.length === 0) return result;

    // 提携中リンク (priority / price_overrides)。
    const { data: links } = await admin
      .from("tenant_supply_links")
      .select("supply_partner_id, priority, price_overrides")
      .eq("tenant_id", tenantId)
      .eq("is_enabled", true);
    const linkBy = new Map(
      (links ?? []).map((l) => [
        l.supply_partner_id as string,
        { priority: Number(l.priority ?? 100), overrides: l.price_overrides },
      ]),
    );
    if (linkBy.size === 0) return result;
    const partnerIds = [...linkBy.keys()];

    // active なパートナーのみ対象。
    const { data: activePartners } = await admin
      .from("supply_partners")
      .select("id")
      .in("id", partnerIds)
      .eq("status", "active");
    const activeSet = new Set((activePartners ?? []).map((p) => p.id as string));
    if (activeSet.size === 0) return result;

    // 候補 SKU を扱う有効商材を取得。
    const skus = [...new Set(lowStock.map((i) => i.supplier_sku as string))];
    const { data: products } = await admin
      .from("supply_partner_products")
      .select("id, supply_partner_id, sku, list_price, lead_time_days, stock_status")
      .in("supply_partner_id", [...activeSet])
      .in("sku", skus)
      .eq("is_active", true);
    if (!products || products.length === 0) return result;

    // SKU -> 候補オプション。
    const optionsBySku = new Map<string, PartnerSourcingOption[]>();
    for (const p of products) {
      const pid = p.supply_partner_id as string;
      const link = linkBy.get(pid);
      if (!link) continue;
      const sku = p.sku as string;
      const opt: PartnerSourcingOption = {
        partnerId: pid,
        partnerProductId: p.id as string,
        sku,
        priority: link.priority,
        listPrice: p.list_price != null ? Number(p.list_price) : null,
        priceOverride: readOverride(link.overrides, sku),
        leadTimeDays: p.lead_time_days != null ? Number(p.lead_time_days) : null,
        stockStatus: (p.stock_status as string | null) ?? null,
      };
      const list = optionsBySku.get(sku) ?? [];
      list.push(opt);
      optionsBySku.set(sku, list);
    }

    // 品目ごとに調達先を選定し、パートナーごとに発注行をまとめる。
    type Line = {
      item_id: string;
      name: string;
      sku: string;
      quantity: number;
      unit_cost: number | null;
      amount: number;
    };
    const byPartner = new Map<string, Line[]>();
    for (const item of lowStock) {
      const sku = item.supplier_sku as string;
      const chosen = selectSourcingOption(optionsBySku.get(sku) ?? []);
      if (!chosen) continue;
      const quantity = computeReorderQuantity(item);
      const unitCost = effectiveUnitPrice(chosen);
      const amount = unitCost != null ? Math.round(unitCost * quantity) : 0;
      const list = byPartner.get(chosen.partnerId) ?? [];
      list.push({ item_id: item.id, name: item.name, sku, quantity, unit_cost: unitCost, amount });
      byPartner.set(chosen.partnerId, list);
    }
    if (byPartner.size === 0) return result;

    for (const [partnerId, lines] of byPartner.entries()) {
      // 冪等性: 同一パートナーの open な auto draft が既にあればスキップ
      // (supply_partner の発注は uq_po_auto_open_per_supplier の対象外のため app 層で担保)。
      const { data: existing } = await admin
        .from("purchase_orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("supply_partner_id", partnerId)
        .eq("source", "auto")
        .eq("status", "draft")
        .limit(1)
        .maybeSingle();
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      const { data: po, error: poErr } = await admin
        .from("purchase_orders")
        .insert({
          tenant_id: tenantId,
          supply_partner_id: partnerId,
          po_number: makePoNumber(),
          status: "draft",
          source: "auto",
          subtotal,
          note: "在庫下限割れにより自動作成された発注ドラフトです (供給パートナー)。内容を確認して承認・送信してください。",
          created_by: null,
        })
        .select("id")
        .single();
      if (poErr || !po) {
        if (isMissingTableOrColumn(poErr)) return result;
        logger.warn("[partnerReorder] PO insert failed", { tenantId, partnerId, err: poErr?.message });
        continue;
      }

      const itemRows = lines.map((l) => ({
        tenant_id: tenantId,
        po_id: po.id,
        item_id: l.item_id,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        amount: l.amount,
      }));
      const { error: itemErr } = await admin.from("purchase_order_items").insert(itemRows);
      if (itemErr) {
        logger.warn("[partnerReorder] PO items insert failed", { tenantId, poId: po.id, err: itemErr.message });
        await admin.from("purchase_orders").delete().eq("id", po.id).eq("tenant_id", tenantId);
        continue;
      }
      result.created += 1;
    }

    return result;
  } catch (e) {
    logger.warn("[partnerReorder] threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return result;
  }
}
