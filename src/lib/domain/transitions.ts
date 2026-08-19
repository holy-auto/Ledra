/**
 * 正準状態遷移表（IMP-015）。
 *
 * v2.0 §19: 各正準状態軸の有効な遷移を定義し、無効な遷移を構造的に拒否する。
 *
 * 目的:
 * - 6 軸（Job / Step / Severity / Certificate / Payment / Sync）の遷移可否の単一定義源
 * - 無効遷移の拒否理由メッセージ
 * - 終端状態の明示（遷移先なし = terminal）
 *
 * 既存の signoff 状態機械（src/lib/signoff/state.ts）はワークフロー計算
 * （「いつ・なぜ遷移するか」）であり、ここで定義するのは構造的制約
 * （「何から何へ遷移できるか」）。両者は補完関係。
 *
 * 既存値→正準値のマッピングについて（ADR-0002 の IMP-015 判断事項）:
 * TS 層マッピングは各消費タスク（IMP-028 証明書 / IMP-031 案件状態 /
 * IMP-027 支払い）で段階的に導入する。ここでは遷移表のみ定義し、
 * 変換関数は作らない（誤った同一視の焼き込み防止を維持）。
 */

import type { JobState, StepState, Severity, CertificateState, PaymentState, SyncState } from "./states";

// ── 案件（Job）遷移表 v2.0 §19.1 ──

export const JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  SCHEDULED: ["CHECKED_IN", "CANCELED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELED", "NO_SHOW"],
  IN_PROGRESS: ["PAUSED", "WAITING_REVIEW", "WAITING_CUSTOMER", "PARTIALLY_COMPLETED", "CANCELED"],
  PAUSED: ["IN_PROGRESS", "CANCELED"],
  WAITING_REVIEW: ["IN_PROGRESS", "WAITING_PAYMENT", "CERTIFICATE_PROCESSING", "CANCELED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELED"],
  WAITING_PAYMENT: ["CERTIFICATE_PROCESSING", "CANCELED"],
  CERTIFICATE_PROCESSING: ["VERIFIED", "WAITING_REVIEW"],
  VERIFIED: [],
  CANCELED: [],
  NO_SHOW: ["SCHEDULED"],
  PARTIALLY_COMPLETED: ["IN_PROGRESS", "CERTIFICATE_PROCESSING", "CANCELED"],
};

// ── 作業ステップ遷移表 v2.0 §19.2 ──

export const STEP_TRANSITIONS: Record<StepState, readonly StepState[]> = {
  NOT_STARTED: ["READY", "SKIPPED", "CANCELED"],
  READY: ["IN_PROGRESS", "SKIPPED", "CANCELED"],
  IN_PROGRESS: ["BLOCKED", "WAITING_APPROVAL", "COMPLETED", "CANCELED"],
  BLOCKED: ["IN_PROGRESS", "CANCELED"],
  WAITING_APPROVAL: ["COMPLETED", "IN_PROGRESS", "CANCELED"],
  COMPLETED: [],
  SKIPPED: [],
  CANCELED: [],
};

// ── 緊急度（Severity）遷移表 v2.0 §19.3 ──
// ponytail: Severity はライフサイクル状態ではなく分類レベル。
// 遷移表はあるが制約は緩い（再評価で自由に変更可能）。
// CRITICAL → NORMAL の直接降格だけ禁止（段階的に下げる）。

export const SEVERITY_TRANSITIONS: Record<Severity, readonly Severity[]> = {
  NORMAL: ["ACTION", "HIGH", "CRITICAL"],
  ACTION: ["NORMAL", "HIGH", "CRITICAL", "RESOLVED"],
  HIGH: ["ACTION", "CRITICAL", "RESOLVED"],
  CRITICAL: ["HIGH", "RESOLVED"],
  RESOLVED: ["NORMAL", "ACTION", "HIGH", "CRITICAL"],
};

// ── 証明書（Certificate）遷移表 v2.0 §12.2 ──

export const CERTIFICATE_TRANSITIONS: Record<CertificateState, readonly CertificateState[]> = {
  NOT_READY: ["READY"],
  READY: ["ISSUING"],
  ISSUING: ["VERIFYING"],
  VERIFYING: ["VERIFIED", "PENDING_CORRECTION"],
  VERIFIED: ["SUPERSEDED", "REVOKED"],
  PENDING_CORRECTION: ["ISSUING"],
  SUPERSEDED: [],
  REVOKED: [],
};

// ── 支払い（Payment）遷移表 v2.0 §11.2 ──
// ponytail: UNKNOWN は「結果不明」。UNKNOWN から再決済（PENDING）は禁止（v2.0 §11.3）。
// UNKNOWN は確認後にのみ PAID / CANCELED へ遷移する。

export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  UNPAID: ["PENDING", "CANCELED"],
  PENDING: ["PAID", "PARTIALLY_PAID", "UNKNOWN", "CANCELED"],
  PARTIALLY_PAID: ["PENDING", "PAID", "REFUNDED", "PARTIALLY_REFUNDED", "CANCELED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED", "OVERPAID"],
  OVERPAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  CANCELED: [],
  UNKNOWN: ["PAID", "CANCELED"],
};

// ── 同期（Sync）遷移表 v2.0 §14.2 ──

export const SYNC_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  SYNCED: ["PENDING"],
  PENDING: ["SYNCING"],
  SYNCING: ["SYNCED", "FAILED", "CONFLICT"],
  FAILED: ["PENDING"],
  CONFLICT: ["PENDING"],
};

// ── 汎用遷移検証 ──

/**
 * 指定の遷移表で from → to が有効か。
 *
 * 呼び出し例:
 *   isValidTransition(JOB_TRANSITIONS, "SCHEDULED", "CHECKED_IN") // true
 *   isValidTransition(PAYMENT_TRANSITIONS, "UNKNOWN", "PENDING")  // false
 */
export function isValidTransition<S extends string>(table: Readonly<Record<S, readonly S[]>>, from: S, to: S): boolean {
  return table[from]?.includes(to) ?? false;
}

/** 現在の状態から遷移可能な状態の一覧を返す。 */
export function validNextStates<S extends string>(table: Readonly<Record<S, readonly S[]>>, current: S): readonly S[] {
  return table[current] ?? [];
}

/** 状態が終端（遷移先なし）か。 */
export function isTerminalState<S extends string>(table: Readonly<Record<S, readonly S[]>>, state: S): boolean {
  return (table[state]?.length ?? 0) === 0;
}

// ── 遷移拒否 ──

export type TransitionRejection = {
  from: string;
  to: string;
  axis: string;
  reason: string;
};

/**
 * 無効遷移の拒否理由を生成する。遷移が有効なら null。
 *
 * 呼び出し例:
 *   rejectTransition(JOB_TRANSITIONS, "job", "VERIFIED", "IN_PROGRESS")
 *   // → { from: "VERIFIED", to: "IN_PROGRESS", axis: "job", reason: "..." }
 */
export function rejectTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  axis: string,
  from: S,
  to: S,
): TransitionRejection | null {
  if (isValidTransition(table, from, to)) return null;

  const next = validNextStates(table, from);
  const reason =
    next.length === 0
      ? `${from} は終端状態です。遷移できません。`
      : `${from} から ${to} への遷移は許可されていません。有効な遷移先: ${next.join(", ")}`;

  return { from, to, axis, reason };
}
