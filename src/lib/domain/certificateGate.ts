/**
 * Certificate Gate 条件型定義（IMP-015）。
 *
 * v2.0 §19.4 / ADR-0005: 正式証明の発行可否は 10 条件をすべて満たしたときのみ
 * READY とし、バックエンド共通 Gate を唯一の判定源とする。
 *
 * ここでは条件の型・結果型を定義。評価器の実装は
 * `src/lib/certificates/gateEvaluator.ts`（IMP-028）。
 * 既存の photoRequirement / signoff は評価器の入力条件として統合される（ADR-0005）。
 */

// ── Gate 条件カタログ ──

/**
 * v2.0 §19.4 の 10 条件。
 *
 * 条件の実装状態:
 * - workflow_completed: signoff 状態機械で部分実装（src/lib/signoff/state.ts）
 * - required_evidence_present: photoRequirement で部分実装
 * - evidence_synced: 未実装（IMP-016 オフライン同期前提）
 * - parts_integrity: 部品 3-way match で実装済み（src/lib/parts/）
 * - in_store_review: 未実装
 * - customer_confirmation_current: 部品確認・受領サインで部分実装
 * - payment_policy_met: 未実装（IMP-027 支払いモデル前提）
 * - no_pending_corrections: 未実装（IMP-030 訂正版管理前提）
 * - no_unresolved_alerts: 未実装
 * - approvals_complete: 未実装
 */
export const CERTIFICATE_GATE_CONDITIONS = [
  "workflow_completed",
  "required_evidence_present",
  "evidence_synced",
  "parts_integrity",
  "in_store_review",
  "customer_confirmation_current",
  "payment_policy_met",
  "no_pending_corrections",
  "no_unresolved_alerts",
  "approvals_complete",
] as const;

export type CertificateGateCondition = (typeof CERTIFICATE_GATE_CONDITIONS)[number];

// ── Gate 判定結果 ──

/** 個別条件の判定結果。 */
export type GateConditionResult = {
  condition: CertificateGateCondition;
  met: boolean;
  /** 不足時の具体的な理由（UI 表示用）。 */
  detail?: string;
};

/**
 * Certificate Gate の総合判定結果。
 *
 * ready = true ⇔ すべての conditions が met: true。
 * UI は conditions を表示するだけで、発行可否を再計算・上書きしない（ADR-0005）。
 */
export type CertificateGateResult = {
  ready: boolean;
  conditions: GateConditionResult[];
};

/** Gate 条件が有効な CertificateGateCondition か。 */
const _conditionSet: ReadonlySet<string> = new Set(CERTIFICATE_GATE_CONDITIONS);

export function isCertificateGateCondition(v: unknown): v is CertificateGateCondition {
  return typeof v === "string" && _conditionSet.has(v);
}
