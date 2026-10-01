/**
 * 外部取込のマージ判定（純粋関数）。 [G5 / Phase 2]
 *
 * 取込は手入力（source='manual'）で確定済みのセルを上書きしない。指定整備記録簿は真実性が要の
 * 帳票であり、人が検証した値を外部データで黙って潰さないため、該当する field_code は upsert 対象
 * から除外し、呼び出し側（将来の UI/連携）が衝突を提示できるようにする。既存が imported のセルや
 * 未登録のセルは upsert 対象（再取込で更新 / 新規追加）。
 *
 * ※ 行の組み立て・upsert はルート側にインラインで残す（check-schema の静的列解決が関数戻り値を
 *    追えず未解決クエリ上限に抵触するため）。本関数は「保護すべき field_code 集合」だけを返す。
 */

export type ExistingCellSource = { field_code: string; source: string | null };

/** 手入力(source='manual')で確定済みの field_code 集合。取込時はこの集合を上書きしない。 */
export function manualProtectedCodes(existing: ExistingCellSource[]): Set<string> {
  return new Set(existing.filter((e) => e.source === "manual").map((e) => e.field_code));
}
