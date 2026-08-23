/**
 * 予約の明細。
 *
 * ponytail: `reservation_items` という別テーブルは**存在しない**。明細は
 * `reservations.menu_items_json`（jsonb 配列）に入っている。
 * 以前は各画面が `reservation_items ( menu_item:menu_items ( name ) )` を
 * 埋め込んでおり、実在しない関係なので PostgREST がクエリごと 400 を返し、
 * 予約・作業・会計の各画面が丸ごと空になっていた。
 *
 * 形の解釈は Web の POS（src/app/admin/pos/PosClient.tsx）と**必ず揃える**。
 * ずれると同じ予約が Web とアプリで違う金額になる。
 *   - 単価は `unit_price` があればそれ、無ければ `price`
 *   - 数量は `quantity`、無ければ 1
 * この列は API 側で `z.any()` 相当のまま通るので、外部連携や自動化が
 * 文字列の金額を入れてくることがある。数値化できるものは数値として扱い、
 * **どうしても読めないものは 0 円にせず「不明」として持ち上げる**
 * （黙って 0 円にすると、その金額のまま決済が通ってしまう）。
 */

export interface ReservationMenuItem {
  name: string;
  /** 単価。読み取れなければ null（不明） */
  unitPrice: number | null;
  quantity: number;
  /** 小計。単価が不明なら null */
  amount: number | null;
  menu_item_id: string | null;
}

/** 数値・数値文字列のどちらでも受ける。読めなければ null */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
    // Web と同じ優先順: unit_price → price
    const unitPrice = toNumber(o.unit_price) ?? toNumber(o.price);
    const quantity = toNumber(o.quantity) ?? 1;
    const id = typeof o.menu_item_id === "string" ? o.menu_item_id : null;
    return [
      {
        name,
        unitPrice,
        quantity,
        amount: unitPrice === null ? null : unitPrice * quantity,
        menu_item_id: id,
      },
    ];
  });
}

/** 明細の合計。単価不明の行は 0 として足す（合計だけを見て決済しないこと） */
export function menuItemsTotal(items: ReservationMenuItem[]): number {
  return items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
}

/**
 * 金額を確定できない行があるか。
 * true のときは決済させないこと（合計が実際より小さく出ている）。
 */
export function hasUnknownPrice(items: ReservationMenuItem[]): boolean {
  return items.some((i) => i.amount === null);
}
