// 案件詳細の「施工条件チェック」: プロジェクトの条件を定義順に全件並べ、案件の記録を重ねる。
// 記録が無い条件は checked_at: null（画面は「未入力」と出す）。記録は ft_condition_checks、条件名は ft_conditions にしか無い。

type Condition = { id: string; label: string; check_type: string };
type Check = {
  id: string;
  condition_id: string;
  value_boolean: boolean | null;
  value_numeric: number | null;
  value_text: string | null;
  checked_at: string | null;
};

export function mergeConditionChecks(conditions: readonly Condition[], checks: readonly Check[]) {
  const byCondition = new Map(checks.map((c) => [c.condition_id, c]));
  return conditions.map((cond) => {
    const check = byCondition.get(cond.id);
    return {
      id: check?.id ?? `condition-${cond.id}`,
      condition_id: cond.id,
      label: cond.label,
      check_type: cond.check_type,
      value_boolean: check?.value_boolean ?? null,
      value_numeric: check?.value_numeric ?? null,
      value_text: check?.value_text ?? null,
      checked_at: check?.checked_at ?? null,
    };
  });
}
