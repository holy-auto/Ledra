/**
 * POS の品目選択で使う純粋ロジック。
 * 画面から切り出してあるのは、検索とカテゴリの優先順位・端数行のパディングが
 * 目で見て確かめにくく、壊れたときに金額の入力導線ごと死ぬため。
 */

/**
 * 「よく使う」に出す件数。
 * ponytail: 店舗が menu_items.sort_order で手で並べた順の上位を流用している。
 * 上限: 実売上頻度ではない。頻度順にするなら payment_items の集計クエリが要る。
 */
export const POPULAR_LIMIT = 12;

/** カテゴリチップとして合成する名前。実カテゴリと衝突させない */
export const SYNTHETIC_CATEGORIES = ["よく使う", "すべて"] as const;

export interface MenuFilterItem {
  name: string;
  category_large: string | null;
}

/**
 * チップに並べるカテゴリ名。先頭は合成チップ。
 * 合成名と同じ実カテゴリは弾く（残すと key が重複し、タップしても
 * 合成側の分岐に落ちて別の品目が出る）。
 */
export function menuCategories(items: MenuFilterItem[]): string[] {
  const unique = new Set<string>();
  for (const item of items) unique.add(item.category_large ?? "未分類");

  const rest = Array.from(unique)
    .filter((c) => !(SYNTHETIC_CATEGORIES as readonly string[]).includes(c))
    .sort();

  return items.length > POPULAR_LIMIT
    ? ["よく使う", "すべて", ...rest]
    : ["すべて", ...rest];
}

/**
 * 表示する品目。検索語があればカテゴリを跨いで探す
 * （探し物が今開いているカテゴリにあるとは限らない）。
 */
export function filterMenuItems<T extends MenuFilterItem>(
  items: T[],
  category: string,
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  if (q) return items.filter((i) => i.name.toLowerCase().includes(q));
  if (category === "よく使う") return items.slice(0, POPULAR_LIMIT);
  if (category === "すべて") return items;
  const cat = category === "未分類" ? null : category;
  return items.filter((i) => (i.category_large ?? null) === cat);
}

/**
 * 端数行のタイルが横に伸びないよう、null で numColumns の倍数に埋める。
 * null は描画側で透明なスペーサーになる。
 */
export function padToColumns<T>(items: T[], numColumns: number): (T | null)[] {
  const rem = items.length % numColumns;
  if (rem === 0) return items;
  return [...items, ...(Array(numColumns - rem).fill(null) as null[])];
}
