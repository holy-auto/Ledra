/**
 * 予約作成の品目（メニュー）選択の絞り込みロジック（純関数）。
 * 品目マスタが多いと一覧が縦に伸びて選びにくいため、大カテゴリ + 検索文字列で候補を絞る。
 * UI から切り離してテスト可能にしておく。
 */

export const UNCATEGORIZED = "未分類";

/** カテゴリタブの「すべて」を表す番兵。null（初期・未選択）と区別するために使う。 */
export const MENU_ALL = "__all__";

/**
 * 品目がこの件数を超えたら、開いた直後に全件を縦にどっと出さず、検索語かカテゴリ選択があるまで一覧を隠す。
 * ponytail: しきい値は固定値。店舗ごとに変えたくなったらテナント設定に逃がす。
 */
export const MENU_REVEAL_THRESHOLD = 12;

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

/** UI のカテゴリ選択を filterMenuItems 用に正規化。「すべて」(MENU_ALL) は絞り込みなし = null。 */
export function resolveMenuCategory(category: string | null): string | null {
  return category === MENU_ALL ? null : category;
}

/**
 * 品目一覧を表示してよいか（POSレジ風の段階表示）。
 * 件数が少なければ常に表示。多い場合は検索語か、カテゴリ選択（「すべて」含む）があるときだけ表示し、
 * それまではプロンプトを出す。これで「開くと全品目が縦にどっと出て選びにくい」状態を防ぐ。
 * category は UI の生の選択値（null=未選択, MENU_ALL=すべて, それ以外=カテゴリ名）を渡す。
 */
export function shouldRevealMenu(
  totalCount: number,
  query: string,
  category: string | null,
  threshold: number = MENU_REVEAL_THRESHOLD,
): boolean {
  if (totalCount <= threshold) return true;
  return query.trim().length > 0 || category !== null;
}
