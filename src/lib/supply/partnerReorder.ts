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
import { decideAutoSend } from "@/lib/supply/autoSend";
import { placeOrderViaApi, type SupplyAuthType } from "@/lib/supply/placeOrder";
import { markOrderDeliveredToPortal } from "@/lib/supply/portalDispatch";
import { notifyPartnerNewPortalOrder } from "@/lib/supply/portalNotify";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { shouldAutoDraftReorder } from "@/lib/ai/automation/orchestrator";

export interface MaybeAutoDraftPartnerReordersResult {
  created: number;
  skipped: number;
  /** 全自動送信(auto-send)で実際に送信した発注数 (壁3 隣接 opt-in)。 */
  autoSent: number;
}

type Line = { item_id: string; name: string; sku: string; quantity: number; unit_cost: number | null; amount: number };

/** 全自動送信のテナント設定 + 対象パートナーの API/信頼状態をまとめた事前読み込み結果。 */
interface AutoSendState {
  enabled: boolean;
  maxOrderJpy: number | null;
  monthlyCapJpy: number | null;
  monthlySentJpy: number;
  shopName: string;
  /** partnerId -> 信頼/搬送 (API・ポータル)/連絡先 */
  partners: Map<
    string,
    {
      trusted: boolean;
      endpoint: string | null;
      authType: SupplyAuthType;
      apiConfig: Record<string, unknown> | null;
      apiKey: string | null;
      portalEnabled: boolean;
      name: string | null;
      contactEmail: string | null;
      lineUserId: string | null;
    }
  >;
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
  const result: MaybeAutoDraftPartnerReordersResult = { created: 0, skipped: 0, autoSent: 0 };
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

    // 全自動送信 (opt-in) の状態を事前読み込み (有効時のみ)。
    const autoSend = await loadAutoSendState(admin, tenantId, [...byPartner.keys()]);

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
      const poNumber = makePoNumber();
      const { data: po, error: poErr } = await admin
        .from("purchase_orders")
        .insert({
          tenant_id: tenantId,
          supply_partner_id: partnerId,
          po_number: poNumber,
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

      // 全自動送信 (壁3 隣接 / opt-in)。全条件を満たすときだけ API 発注して sent にする。
      if (autoSend) {
        const sent = await attemptAutoSend(admin, tenantId, po.id, poNumber, partnerId, subtotal, lines, autoSend);
        if (sent) {
          autoSend.monthlySentJpy += subtotal; // 月次累計を更新 (同一実行内の上限管理)
          result.autoSent += 1;
        }
      }
    }

    return result;
  } catch (e) {
    logger.warn("[partnerReorder] threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return result;
  }
}

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/**
 * 全自動送信の事前読み込み。設定が OFF / 上限未設定なら null (= 自動送信しない)。
 * 有効時のみ、対象パートナーの API 設定・鍵・信頼フラグと当月の自動送信累計を集める。
 */
async function loadAutoSendState(admin: Admin, tenantId: string, partnerIds: string[]): Promise<AutoSendState | null> {
  const { data: settings } = await admin
    .from("tenant_supply_auto_send_settings")
    .select("enabled, max_order_jpy, monthly_cap_jpy")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!settings || settings.enabled !== true) return null;
  const maxOrderJpy = settings.max_order_jpy != null ? Number(settings.max_order_jpy) : null;
  const monthlyCapJpy = settings.monthly_cap_jpy != null ? Number(settings.monthly_cap_jpy) : null;
  // 上限が両方とも正でなければ自動送信しない (安全側) — 事前に打ち切ってモデル/鍵読み込みを省く。
  if (!maxOrderJpy || maxOrderJpy <= 0 || !monthlyCapJpy || monthlyCapJpy <= 0) return null;

  // 当月の自動送信累計 (transport=api かつ今月 sent)。
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: sentThisMonth } = await admin
    .from("purchase_orders")
    .select("subtotal")
    .eq("tenant_id", tenantId)
    .eq("source", "auto")
    .eq("transport", "api")
    .gte("sent_at", monthStart.toISOString());
  const monthlySentJpy = (sentThisMonth ?? []).reduce((s, r) => s + Number(r.subtotal ?? 0), 0);

  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const shopName = (tenant?.name as string | null) ?? "当店";

  // 対象パートナーの API 設定 + 信頼フラグ + 鍵。
  const { data: partnerRows } = await admin
    .from("supply_partners")
    .select("id, is_trusted, api_endpoint, api_auth_type, portal_enabled, name, contact_email, line_user_id")
    .in("id", partnerIds);
  const { data: credRows } = await admin
    .from("supply_partner_credentials")
    .select("supply_partner_id, api_key_ciphertext")
    .in("supply_partner_id", partnerIds);
  const credBy = new Map(
    (credRows ?? []).map((c) => [c.supply_partner_id as string, c.api_key_ciphertext as string | null]),
  );

  const partners: AutoSendState["partners"] = new Map();
  for (const p of partnerRows ?? []) {
    const apiKey = await readSecret(credBy.get(p.id as string) ?? null, "supply_partner_credentials.api_key");
    partners.set(p.id as string, {
      trusted: p.is_trusted === true,
      endpoint: (p.api_endpoint as string | null) ?? null,
      authType: ((p.api_auth_type as string | null) ?? "none") as SupplyAuthType,
      apiConfig: null,
      apiKey,
      portalEnabled: p.portal_enabled === true,
      name: (p.name as string | null) ?? null,
      contactEmail: (p.contact_email as string | null) ?? null,
      lineUserId: (p.line_user_id as string | null) ?? null,
    });
  }
  return { enabled: true, maxOrderJpy, monthlyCapJpy, monthlySentJpy, shopName, partners };
}

/**
 * 1 件の draft 発注を、ガード判定を通れば API 発注して sent にする。送信できたら true。
 * 失敗 / 不許可なら draft のまま (人の承認待ち)。
 */
async function attemptAutoSend(
  admin: Admin,
  tenantId: string,
  poId: string,
  poNumber: string,
  partnerId: string,
  subtotal: number,
  lines: Line[],
  state: AutoSendState,
): Promise<boolean> {
  const p = state.partners.get(partnerId);
  const hasApi = Boolean(p && p.authType !== "none" && p.endpoint && p.apiKey);
  const hasPortal = Boolean(p?.portalEnabled);

  const decision = decideAutoSend({
    optInEnabled: state.enabled,
    partnerTrusted: Boolean(p?.trusted),
    partnerHasApi: hasApi,
    partnerHasPortal: hasPortal,
    orderTotalJpy: subtotal,
    maxOrderJpy: state.maxOrderJpy,
    monthlyCapJpy: state.monthlyCapJpy,
    monthlySentJpy: state.monthlySentJpy,
  });
  if (!decision.ok) return false;
  if (!p) return false;

  // API 連携が無く、ポータル連携のみのパートナーはポータルに投函 (回答待ち) する。
  if (!hasApi && hasPortal) {
    const delivered = await markOrderDeliveredToPortal(admin, tenantId, poId);
    if (!delivered) return false;
    await notifyPartnerNewPortalOrder(
      { partnerName: p.name, email: p.contactEmail, lineUserId: p.lineUserId },
      { shopName: state.shopName, poNumber },
    );
    logger.info("[partnerReorder] auto-delivered order to portal", { tenantId, poId, partnerId, subtotal });
    return true;
  }

  const placed = await placeOrderViaApi(
    partnerId,
    { endpoint: p.endpoint as string, authType: p.authType, apiKey: p.apiKey, config: p.apiConfig },
    {
      poNumber,
      shopName: state.shopName,
      items: lines.map((l) => ({ name: l.name, sku: l.sku, quantity: l.quantity, unit_cost: l.unit_cost })),
      subtotal,
      note: null,
    },
  );
  if (!placed.ok) {
    logger.warn("[partnerReorder] auto-send API failed; left as draft", {
      tenantId,
      poId,
      partnerId,
      err: placed.error,
    });
    return false;
  }

  await admin
    .from("purchase_orders")
    .update({
      status: "sent",
      source: "auto",
      sent_at: new Date().toISOString(),
      transport: "api",
      transport_status: "acked",
      external_order_id: placed.externalOrderId,
    })
    .eq("id", poId)
    .eq("tenant_id", tenantId);
  logger.info("[partnerReorder] auto-sent order", { tenantId, poId, partnerId, subtotal });
  return true;
}
