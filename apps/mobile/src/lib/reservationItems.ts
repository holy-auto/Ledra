/**
 * 予約の明細。
 *
 * ponytail: `reservation_items` という別テーブルは**存在しない**。明細は
 * `reservations.menu_items_json`（jsonb 配列）に入っている。
 * 以前は各画面が `reservation_items ( menu_item:menu_items ( name ) )` を
 * 埋め込んでおり、実在しない関係なので PostgREST がクエリごと 400 を返し、
 * 予約・作業・会計の各画面が丸ごと空になっていた。
 *
 * 形式: [{ name, price, menu_item_id }]
 * 数量は持たない（1点＝1行）。数量が要るようになったら、この形を変えるのではなく
 * 明細テーブルを作るべき。
 */

export interface ReservationMenuItem {
  name: string;
  price: number;
  menu_item_id: string | null;
}

/**
 * `menu_items_json` を安全に配列へ均す。
 * 過去データや外部連携で欠けた項目があっても画面を落とさない。
 */
export function parseMenuItems(raw: unknown): ReservationMenuItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!name) return [];
    const price = typeof o.price === "number" && Number.isFinite(o.price) ? o.price : 0;
    const id = typeof o.menu_item_id === "string" ? o.menu_item_id : null;
    return [{ name, price, menu_item_id: id }];
  });
}

/** 明細の合計金額 */
export function menuItemsTotal(items: ReservationMenuItem[]): number {
  return items.reduce((sum, i) => sum + i.price, 0);
}
