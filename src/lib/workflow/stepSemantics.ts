/**
 * テナントが各々設定するワークフロー工程（{key,label}）の「意味」を推定する。
 *
 * ワークフローエンジンの工程は自由記述だが、既定テンプレートは `certificate`
 * (証明書発行) や `billing` (会計) といった意味のある工程を含む。これを推定して
 * チェーンの自動化（証明書ドラフト生成など）に接続するためのヘルパー。
 *
 * 純関数。判定は key（英語キー）と label（日本語名）の両方を見る。
 */

export type WorkflowStepSemantic = "certificate" | "billing" | "inspection";

export function classifyWorkflowStep(step: {
  key?: string | null;
  label?: string | null;
}): WorkflowStepSemantic | null {
  const key = (step.key ?? "").toLowerCase();
  const label = step.label ?? "";

  // 証明書（cert / 証明書 / 保証書）
  if (key.includes("cert") || /証明書|保証書/.test(label)) return "certificate";

  // 会計・請求（billing / invoice / payment / accounting / 会計 / 請求 / 精算 / 支払）
  if (
    key.includes("billing") ||
    key.includes("invoice") ||
    key.includes("payment") ||
    key.includes("accounting") ||
    /会計|請求|精算|支払/.test(label)
  ) {
    return "billing";
  }

  // 検査・仕上げ（inspect / check / quality / 検査 / 仕上 / 品質 / チェック）
  if (
    key.includes("inspect") ||
    key.includes("check") ||
    key.includes("quality") ||
    /検査|仕上|品質|チェック/.test(label)
  ) {
    return "inspection";
  }

  return null;
}
