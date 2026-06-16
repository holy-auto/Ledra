/**
 * 所要時間の概算。
 *
 * 施工メニューの基準作業分（menu_items.estimated_minutes）の合計に、
 * 車両サイズ係数（vehicles.size_class）を掛けて見積もる。
 * あくまで概算で、実績で上書き可能な「予定」値の用途。
 */

/** vehicles.size_class（SS 〜 XL）→ 作業時間の係数。大きい車ほど時間がかかる。 */
export const SIZE_DURATION_MULTIPLIER: Record<string, number> = {
  SS: 0.8,
  S: 0.9,
  M: 1.0,
  L: 1.15,
  LL: 1.3,
  XL: 1.5,
};

export function sizeMultiplier(sizeClass: string | null | undefined): number {
  if (!sizeClass) return 1.0;
  return SIZE_DURATION_MULTIPLIER[sizeClass.trim().toUpperCase()] ?? 1.0;
}

/**
 * メニューの基準作業分（複数）と車両サイズから所要時間（分）を見積もる。
 *
 * - 有効な estimated_minutes が 1 件も無ければ null（=見積り不能）
 * - 合計分 × サイズ係数 を四捨五入して返す
 */
export function estimateReservationMinutes(
  items: Array<{ estimated_minutes?: number | null }> | null | undefined,
  sizeClass?: string | null,
): number | null {
  const list = items ?? [];
  let base = 0;
  let hasAny = false;
  for (const it of list) {
    const m = it?.estimated_minutes;
    if (typeof m === "number" && Number.isFinite(m) && m > 0) {
      base += m;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return Math.round(base * sizeMultiplier(sizeClass));
}

/** 分 → "2時間30分" / "45分" の表記。 */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}
