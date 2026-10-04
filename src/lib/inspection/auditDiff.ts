/**
 * 監査ログ用の「更新箇所」差分。 [G2 / 指定整備記録簿の更新履歴]
 *
 * 点検整備記録簿の電子化基準（第２ ２（３））は、更新の**更新箇所**と作業者・日時の自動記録を求める。
 * PATCH で送られた新値と、更新前の行を突き合わせ、**実際に変わったフィールドだけ**を
 * `{field: {old, new}}` で返す（audit_logs の query_json に載せて 更新箇所＋前後値 を残す）。
 *
 * 等価判定は JSON 文字列で行う（answers / photo_urls / template_items などの jsonb・配列も比較できる）。
 * ponytail: JSON.stringify はキー順の違いを別物と見なす。本記録簿の更新は Zod 正規化後の値なので
 *   キー順は安定だが、順不同オブジェクトの厳密比較が要るなら deep-equal の導入を検討（現状は不要）。
 */

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * oldRow（更新前の行）と updates（適用する新値）から、変わったフィールドの前後値を返す。
 * updated_at のような自動管理列は updates から渡さない前提（呼び出し側で除く）。
 */
export function changedFields(
  oldRow: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  const old = oldRow ?? {};
  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = old[key];
    if (!eq(oldVal, newVal)) out[key] = { old: oldVal ?? null, new: newVal ?? null };
  }
  return out;
}

/**
 * 変わったフィールドの**名前だけ**を返す（前後値は載せない）。
 * documents / body_repair_jobs のように PII（宛先名・住所）や大きな JSON（明細）を含む行で、
 * 「更新箇所＋作業者＋日時」の要件（第２ ２（３））を満たしつつ audit_logs への PII 複製と肥大を避けるため。
 */
export function changedFieldKeys(
  oldRow: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
): string[] {
  const old = oldRow ?? {};
  return Object.keys(updates).filter((key) => !eq(old[key], updates[key]));
}
