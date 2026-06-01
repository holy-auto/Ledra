/**
 * 供給パートナーの調達先選定 + 実効卸値の決定 — 純関数のみ (#2 店舗別卸値上書き / #3 優先度選定)。
 *
 * 同一商材 (同じ SKU) を複数の提携パートナーが扱う場合に「どのパートナーから・いくらで」
 * 発注するかを deterministic に決める。金額に関わるため AI は使わず計算を固定する
 * (壁3 / reorder.ts と同方針)。IO (DB) は呼び出し側。
 */

export interface PartnerSourcingOption {
  partnerId: string;
  /** supply_partner_products.id (発注明細の紐付け用)。 */
  partnerProductId: string;
  sku: string;
  /** tenant_supply_links.priority。**小さいほど優先** (1 が最優先, 既定 100)。 */
  priority: number;
  /** supply_partner_products.list_price (標準卸値, 円・税抜)。 */
  listPrice: number | null;
  /** tenant_supply_links.price_overrides[sku] (店舗別の卸値上書き)。 */
  priceOverride: number | null;
  /** supply_partner_products.lead_time_days。 */
  leadTimeDays: number | null;
  /** supply_partner_products.stock_status (任意表記)。 */
  stockStatus: string | null;
}

/**
 * 実効卸値: 店舗別上書き (price_overrides) があればそれ、無ければカタログ list_price。
 * 上書きは 0 以上の数値のみ有効 (負値は無視)。
 */
export function effectiveUnitPrice(opt: Pick<PartnerSourcingOption, "listPrice" | "priceOverride">): number | null {
  if (typeof opt.priceOverride === "number" && opt.priceOverride >= 0) return opt.priceOverride;
  return opt.listPrice;
}

/** 在庫切れ表記か (発注先候補から除外する)。空/不明は在庫ありとして扱う。 */
export function isOutOfStock(stockStatus: string | null | undefined): boolean {
  if (!stockStatus) return false;
  const s = stockStatus.trim().toLowerCase();
  return s === "out" || s === "out_of_stock" || s === "oos" || s === "在庫なし" || s === "欠品" || s === "品切れ";
}

/**
 * 複数候補から最適な調達先を 1 つ選ぶ。
 *
 * 選定順 (安定ソート):
 *   ① 在庫切れを除外
 *   ② priority 昇順 (小さいほど優先)
 *   ③ 実効卸値 昇順 (null は後ろ)
 *   ④ リードタイム 昇順 (null は後ろ)
 *   ⑤ partnerId 昇順 (完全な決定性のための tie-break)
 *
 * 候補なし (全て在庫切れ / 空) なら null。
 */
export function selectSourcingOption(options: PartnerSourcingOption[]): PartnerSourcingOption | null {
  const candidates = options.filter((o) => !isOutOfStock(o.stockStatus));
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;

    const pa = effectiveUnitPrice(a);
    const pb = effectiveUnitPrice(b);
    if (pa == null || pb == null) {
      if (pa == null && pb != null) return 1; // 価格不明は後ろ
      if (pb == null && pa != null) return -1;
    } else if (pa !== pb) {
      return pa - pb;
    }

    const la = a.leadTimeDays;
    const lb = b.leadTimeDays;
    if (la == null || lb == null) {
      if (la == null && lb != null) return 1;
      if (lb == null && la != null) return -1;
    } else if (la !== lb) {
      return la - lb;
    }

    return a.partnerId < b.partnerId ? -1 : a.partnerId > b.partnerId ? 1 : 0;
  });

  return ranked[0];
}
