/**
 * 発注 (reorder) の数量計算と仕入先グルーピング — 純関数のみ。
 *
 * 低在庫の品目から「いくつ・どの仕入先に」発注すべきかを deterministic に計算する。
 * AI は使わない (金額に関わるため計算は決定論的に固定する)。IO (DB 書き込み) は
 * `reorderAuto.ts` 側が行う。
 */

export interface ReorderableItem {
  id: string;
  name: string;
  sku: string | null;
  supplier_id: string | null;
  current_stock: number;
  min_stock: number;
  /** 1 回あたりの既定発注数。未設定なら不足分から算出する。 */
  reorder_qty: number | null;
  unit_cost: number | null;
}

export interface ReorderLine {
  item_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number | null;
  amount: number;
}

export interface SupplierReorderGroup {
  supplier_id: string;
  lines: ReorderLine[];
  subtotal: number;
}

/**
 * 1 品目の発注数を決める。
 *
 *   - reorder_qty が正なら、それを優先 (店が決めた既定ロット)。
 *   - 無ければ「下限まで戻す不足分」を切り上げ、最低 1。
 *
 * 在庫は numeric なので小数もあり得るが、発注は整数個で扱う (切り上げ)。
 */
export function computeReorderQuantity(
  item: Pick<ReorderableItem, "current_stock" | "min_stock" | "reorder_qty">,
): number {
  if (typeof item.reorder_qty === "number" && item.reorder_qty > 0) {
    return Math.ceil(item.reorder_qty);
  }
  const deficit = item.min_stock - item.current_stock;
  return Math.max(1, Math.ceil(deficit));
}

/** 品目が発注対象か (下限割れ + 下限設定あり + 仕入先あり)。 */
export function needsReorder(item: ReorderableItem): boolean {
  return !!item.supplier_id && item.min_stock > 0 && item.current_stock <= item.min_stock;
}

/**
 * 低在庫品目を仕入先ごとの発注グループにまとめる。
 *
 * - 仕入先 (supplier_id) が無い品目は発注できないので除外する。
 * - 下限を切っていない品目も除外する。
 * - 金額 (amount) は unit_cost があるときだけ計算し、subtotal に積む。
 */
export function computeReorderGroups(items: ReorderableItem[]): SupplierReorderGroup[] {
  const bySupplier = new Map<string, ReorderLine[]>();

  for (const item of items) {
    if (!needsReorder(item)) continue;
    const supplierId = item.supplier_id as string;
    const quantity = computeReorderQuantity(item);
    const unitCost = typeof item.unit_cost === "number" ? item.unit_cost : null;
    const amount = unitCost != null ? Math.round(unitCost * quantity) : 0;
    const line: ReorderLine = {
      item_id: item.id,
      name: item.name,
      sku: item.sku,
      quantity,
      unit_cost: unitCost,
      amount,
    };
    const list = bySupplier.get(supplierId) ?? [];
    list.push(line);
    bySupplier.set(supplierId, list);
  }

  const groups: SupplierReorderGroup[] = [];
  for (const [supplier_id, lines] of bySupplier.entries()) {
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    groups.push({ supplier_id, lines, subtotal });
  }
  // 金額の大きい順 (UI で重要な発注を上に出しやすい)。
  groups.sort((a, b) => b.subtotal - a.subtotal);
  return groups;
}
