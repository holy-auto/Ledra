/**
 * 案件例外フロー評価器（IMP-031）。
 *
 * v2.0 §19.1: cancel / no-show / pause / resume / partial-completion の
 * 遷移を評価する純関数群。JOB_TRANSITIONS を参照し、遷移ルールを二重管理しない。
 *
 * 追加作業（スコープ変更）の版管理型も定義する。
 *
 * DB マイグレーション・API ルート変更なし。型基盤と遷移評価のみ。
 */

import type { JobState } from "./states";
import { JOB_TRANSITIONS, isValidTransition, rejectTransition } from "./transitions";

// ── 遷移評価結果 ──

export type JobTransitionResult = {
  valid: boolean;
  reason?: string;
  newState?: JobState;
};

// ── Cancel 評価 ──

/**
 * キャンセル遷移を評価する。
 *
 * v2.0 §19.1: SCHEDULED / CHECKED_IN / IN_PROGRESS / PAUSED /
 * WAITING_REVIEW / WAITING_CUSTOMER / WAITING_PAYMENT / PARTIALLY_COMPLETED
 * から CANCELED へ遷移可能。VERIFIED / CANCELED は不可。
 */
export function evaluateCancel(currentState: JobState): JobTransitionResult {
  if (isValidTransition(JOB_TRANSITIONS, currentState, "CANCELED")) {
    return { valid: true, newState: "CANCELED" };
  }
  const rejection = rejectTransition(JOB_TRANSITIONS, "job", currentState, "CANCELED");
  return { valid: false, reason: rejection?.reason };
}

// ── No-Show 評価 ──

/**
 * 来店なし遷移を評価する。
 *
 * v2.0 §19.1: SCHEDULED のみ → NO_SHOW（JOB_TRANSITIONS 参照）。
 * CHECKED_IN は不可 —— 入庫済みの案件は「来店なし」になりえない
 * （誤操作で CHECKED_IN にした場合は CANCELED で抜ける）。
 * 作業開始後の no-show も概念として成立しない。
 */
export function evaluateNoShow(currentState: JobState): JobTransitionResult {
  if (isValidTransition(JOB_TRANSITIONS, currentState, "NO_SHOW")) {
    return { valid: true, newState: "NO_SHOW" };
  }
  const rejection = rejectTransition(JOB_TRANSITIONS, "job", currentState, "NO_SHOW");
  return { valid: false, reason: rejection?.reason };
}

// ── Pause 評価 ──

/**
 * 中断遷移を評価する。
 *
 * v2.0 §19.1: IN_PROGRESS のみ → PAUSED。
 * 翌日持ち越し・部品待ち・天候不良などの一時中断。
 */
export function evaluatePause(currentState: JobState): JobTransitionResult {
  if (isValidTransition(JOB_TRANSITIONS, currentState, "PAUSED")) {
    return { valid: true, newState: "PAUSED" };
  }
  const rejection = rejectTransition(JOB_TRANSITIONS, "job", currentState, "PAUSED");
  return { valid: false, reason: rejection?.reason };
}

// ── Resume 評価 ──

/**
 * 再開遷移を評価する。
 *
 * v2.0 §19.1: PAUSED → IN_PROGRESS / NO_SHOW → SCHEDULED。
 * PARTIALLY_COMPLETED → IN_PROGRESS も再開として扱う。
 */
export function evaluateResume(currentState: JobState): JobTransitionResult {
  const resumeTargets: Partial<Record<JobState, JobState>> = {
    PAUSED: "IN_PROGRESS",
    NO_SHOW: "SCHEDULED",
    PARTIALLY_COMPLETED: "IN_PROGRESS",
  };

  const target = resumeTargets[currentState];
  if (!target) {
    return {
      valid: false,
      reason: `${currentState} は中断・来店なし・部分終了状態ではありません。再開できません。`,
    };
  }

  // 遷移表でも検証（防御的）
  if (isValidTransition(JOB_TRANSITIONS, currentState, target)) {
    return { valid: true, newState: target };
  }
  const rejection = rejectTransition(JOB_TRANSITIONS, "job", currentState, target);
  return { valid: false, reason: rejection?.reason };
}

// ── Partial Completion 評価 ──

/**
 * 部分終了遷移を評価する。
 *
 * v2.0 §19.1: IN_PROGRESS → PARTIALLY_COMPLETED。
 * 一部工程のみ完了し、残りは後日対応。
 */
export function evaluatePartialComplete(currentState: JobState): JobTransitionResult {
  if (isValidTransition(JOB_TRANSITIONS, currentState, "PARTIALLY_COMPLETED")) {
    return { valid: true, newState: "PARTIALLY_COMPLETED" };
  }
  const rejection = rejectTransition(JOB_TRANSITIONS, "job", currentState, "PARTIALLY_COMPLETED");
  return { valid: false, reason: rejection?.reason };
}

// ── 例外メタデータ型 ──

/** キャンセル理由カテゴリ。 */
export const CANCEL_REASON_CATEGORIES = [
  "customer_request", // 顧客都合
  "shop_request", // 店舗都合（設備故障・スタッフ欠員等）
  "weather", // 天候不良
  "parts_unavailable", // 部品未着・在庫切れ
  "schedule_conflict", // スケジュール競合
  "other", // その他
] as const;

export type CancelReasonCategory = (typeof CANCEL_REASON_CATEGORIES)[number];

/** 中断理由カテゴリ。 */
export const PAUSE_REASON_CATEGORIES = [
  "overnight_hold", // 翌日持ち越し
  "parts_waiting", // 部品待ち
  "weather", // 天候待ち（屋外作業）
  "customer_decision", // 顧客判断待ち（追加作業の承認等）
  "equipment_issue", // 設備不具合
  "other", // その他
] as const;

export type PauseReasonCategory = (typeof PAUSE_REASON_CATEGORIES)[number];

/** No-Show 後のアクションカテゴリ。 */
export const NO_SHOW_ACTIONS = [
  "reschedule", // 再予約
  "cancel", // キャンセル
  "contact_pending", // 顧客連絡中
] as const;

export type NoShowAction = (typeof NO_SHOW_ACTIONS)[number];

/** 部分終了理由カテゴリ。 */
export const PARTIAL_COMPLETE_REASONS = [
  "scope_split", // 作業分割（一部を後日に延期）
  "parts_shortage", // 部品不足で一部工程が完了不能
  "time_constraint", // 時間制約（営業時間等）
  "customer_request", // 顧客要望による範囲縮小
  "other", // その他
] as const;

export type PartialCompleteReason = (typeof PARTIAL_COMPLETE_REASONS)[number];

// ── 例外イベントレコード型 ──

/** 案件例外イベント。DB マイグレーション時にテーブル設計の基礎となる型定義。 */
export type JobExceptionEvent = {
  id: string;
  reservationId: string;
  tenantId: string;
  /** 遷移前の状態。全評価器の入力が JobState 型であることに合わせる。 */
  fromState: JobState;
  /** 遷移後の状態。 */
  toState: JobState;
  /** 例外の種別。 */
  type: "cancel" | "no_show" | "pause" | "resume" | "partial_complete";
  /** 理由カテゴリ。 */
  reasonCategory?: string;
  /** 自由記述の理由。 */
  reasonDetail?: string;
  /** 操作者。 */
  performedBy: string;
  performedAt: string;
  /** No-Show 後のアクション。 */
  noShowAction?: NoShowAction;
  /** 再予約先の reservation ID（reschedule 時）。 */
  rescheduledToId?: string;
  /** 中断からの再開日時。 */
  resumedAt?: string;
};

// ── スコープ変更（追加作業）型 ──

/** スコープ変更の理由カテゴリ。 */
export const SCOPE_CHANGE_CATEGORIES = [
  "additional_work", // 追加作業（作業中に追加要望）
  "scope_reduction", // 作業縮小（一部取りやめ）
  "specification_change", // 仕様変更（素材・グレード変更等）
  "error_correction", // 見積り誤り修正
  "other", // その他
] as const;

export type ScopeChangeCategory = (typeof SCOPE_CHANGE_CATEGORIES)[number];

/**
 * スコープ変更レコード。
 *
 * 既存の menu_items_json（作業内容 JSON）の版管理。
 * reservation_id + version で一意。
 */
export type ScopeChangeRecord = {
  id: string;
  reservationId: string;
  tenantId: string;
  /** 変更前のバージョン番号。 */
  fromVersion: number;
  /** 変更後のバージョン番号。 */
  toVersion: number;
  category: ScopeChangeCategory;
  /** 変更理由（人間可読）。 */
  reason: string;
  /** 変更前の menu_items_json スナップショット。 */
  previousMenuItems: unknown;
  /** 変更後の menu_items_json スナップショット。 */
  newMenuItems: unknown;
  /** 金額差分（正 = 増額、負 = 減額）。 */
  amountDelta?: number;
  /** 顧客承認が必要か。 */
  requiresCustomerApproval: boolean;
  /** 顧客承認状態。 */
  customerApproved?: boolean;
  customerApprovedAt?: string;
  /** 操作者。 */
  performedBy: string;
  performedAt: string;
};

/**
 * スコープ変更に顧客承認が必要かを判定する。
 *
 * ルール: 増額の場合は常に承認必要。減額・同額は不要。
 * ponytail: 将来的に閾値（例: 1万円以上のみ承認）を追加する場合はここを拡張。
 */
export function requiresApproval(amountDelta: number | undefined): boolean {
  return (amountDelta ?? 0) > 0;
}

/**
 * 案件が例外状態（非ハッピーパス）にあるかを判定する。
 */
export function isExceptionState(state: JobState): boolean {
  return state === "CANCELED" || state === "NO_SHOW" || state === "PAUSED" || state === "PARTIALLY_COMPLETED";
}
