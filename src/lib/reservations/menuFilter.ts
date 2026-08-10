/**
 * 予約作成の品目（メニュー）選択の絞り込みロジック（純関数）。
 * 品目マスタが多いと一覧が縦に伸びて選びにくいため、大カテゴリ + 検索文字列で候補を絞る。
 * UI から切り離してテスト可能にしておく。
 */

export const UNCATEGORIZED = "未分類";

type CategorizedItem = { name: string; category_large: string | null };

/** 品目の大カテゴリ一覧。未分類の品目が1件でもあれば末尾に「未分類」を足す。 */
export function menuCategoriesOf(items: readonly CategorizedItem[]): string[] {
  const set = new Set<string>();
  let hasNull = false;
  for (const mi of items) {
    if (mi.category_large) set.add(mi.category_large);
    else hasNull = true;
  }
  const arr = Array.from(set);
  if (hasNull) arr.push(UNCATEGORIZED);
  return arr;
}

/**
 * 検索文字列（部分一致・大小無視）と選択カテゴリで品目を絞り込む。
 * category が null のときは全件。未分類の品目は category === UNCATEGORIZED で拾える。
 */
export function filterMenuItems<T extends CategorizedItem>(
  items: readonly T[],
  query: string,
  category: string | null,
): T[] {
  const q = query.trim().toLowerCase();
  return items.filter((mi) => {
    if (category && (mi.category_large || UNCATEGORIZED) !== category) return false;
    if (q && !mi.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
