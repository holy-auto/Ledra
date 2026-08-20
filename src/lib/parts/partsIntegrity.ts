/**
 * IMP-040: Certificate Gate 部品整合性条件の導出（純関数）。
 *
 * gate evaluator の `partsIntegrityOk` パラメータを、実際の findings データから
 * 導出する。未解決(open/acknowledged)の critical findings が 1 件でもあればブロック。
 *
 * 使い方:
 *   const ok = derivePartsIntegrityOk(findings);
 *   evaluateCertificateGate({ ...input, partsIntegrityOk: ok });
 */

import type { FindingSeverity } from "./integrityChecks";

/** findings テーブルから取得した行の最小インターフェース。 */
export interface PartFindingSummary {
  severity: FindingSeverity;
  status: string; // open | acknowledged | resolved | dismissed
}

/**
 * 未解決の critical findings が存在するかを判定する。
 *
 * - resolved / dismissed は無視（解消済み）。
 * - warning / info は Certificate Gate をブロックしない（運用監査の情報）。
 * - critical + open/acknowledged → ブロック。
 *
 * 部品装着レコードが 0 件の場合は findings も 0 件 → true（部品なし = 通過）。
 */
export function derivePartsIntegrityOk(findings: readonly PartFindingSummary[]): boolean {
  return !findings.some((f) => f.severity === "critical" && f.status !== "resolved" && f.status !== "dismissed");
}
