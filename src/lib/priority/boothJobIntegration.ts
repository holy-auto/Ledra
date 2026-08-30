/**
 * IMP-044: ブースシグナル → ジョブ次アクション統合。
 *
 * IMP-041 boothSignals.ts のコメント:
 * > pickJobNextActionCandidate() 自体の booth 拡張は IMP-044 で行う
 *
 * pickJobNextActionCandidate は Job 単位の deterministic 候補選択。
 * ブースシグナルは施設全体の状態。本モジュールはブース状態を Job の文脈に
 * 注入し、候補の上書き or 追加ヒント付与を行う。
 *
 * 設計: pickJobNextActionCandidate の結果をラップし、ブース状態で調整する。
 * 既存関数のシグネチャは変えない（呼び出し側への影響ゼロ）。
 *
 * ponytail: 型と純関数のみ。IO なし。
 */

import {
  pickJobNextActionCandidate,
  type JobNextActionInput,
  type JobNextActionSuggestion,
} from "@/lib/ai/jobNextAction";
import type { BoothSignal } from "@/lib/booths/boothSignals";

// ── 型 ──

/** ブース文脈付きの拡張入力。 */
export interface JobWithBoothContext extends JobNextActionInput {
  /** この案件の予約 ID。 */
  reservationId: string;
  /** この案件にブースが割り当て済みか。 */
  hasBoothAssigned: boolean;
  /** この案件のブースで定員超過が発生しているか。 */
  boothCapacityExceeded: boolean;
}

/** ブース文脈で調整された結果。 */
export interface EnrichedJobSuggestion extends JobNextActionSuggestion {
  /** ブース関連のヒント（あれば）。 */
  boothHint?: string;
  /** 元の priority から変更されたか。 */
  priorityAdjusted: boolean;
}

// ── 純関数 ──

/**
 * pickJobNextActionCandidate の結果をブース文脈で調整する。
 *
 * ルール:
 * 1. follow_up_overdue（期限超過請求）→ 金銭の督促が最優先。ブースのヒントは付けない
 * 2. arrived / in_progress でブース未割当 → priority を high に引き上げ + ヒント追加
 * 3. 定員超過 → ヒントを追加（priority は元のまま。定員超過の解消はブース管理の責務）
 * 4. それ以外 → 元のまま返す
 */
export function enrichJobWithBoothContext(input: JobWithBoothContext): EnrichedJobSuggestion {
  const base = pickJobNextActionCandidate(input);

  // follow_up_overdue は他のどのブース文脈より優先する（金銭 > ブース）。
  // ここで早期リターンしないと、下の2分岐がヒント・priority を上書きしてしまう。
  if (base.action === "follow_up_overdue") {
    return { ...base, priorityAdjusted: false };
  }

  // arrived / in_progress でブース未割当 — 作業場所がない
  if (!input.hasBoothAssigned && (input.status === "arrived" || input.status === "in_progress")) {
    return {
      ...base,
      priority: "high",
      boothHint: "ブースが未割当です。先にブースを割り当ててください。",
      priorityAdjusted: base.priority !== "high",
    };
  }

  // 定員超過 — 警告ヒントのみ（priority は変えない）
  if (input.boothCapacityExceeded) {
    return {
      ...base,
      boothHint: "割当ブースが定員超過です。移動を検討してください。",
      priorityAdjusted: false,
    };
  }

  return { ...base, priorityAdjusted: false };
}

/**
 * ブースシグナル一覧から、指定 reservationId に関連するシグナルを抽出する。
 *
 * BoothSignal.reservationIds に含まれるかで判定。
 */
export function boothSignalsForReservation(signals: readonly BoothSignal[], reservationId: string): BoothSignal[] {
  return signals.filter((s) => s.reservationIds.includes(reservationId));
}

/**
 * ブースシグナルから JobWithBoothContext のブースフィールドを導出する。
 *
 * relevantSignals は boothSignalsForReservation の結果を渡す。
 */
export function deriveBoothContextForJob(
  relevantSignals: readonly BoothSignal[],
): Pick<JobWithBoothContext, "hasBoothAssigned" | "boothCapacityExceeded"> {
  const needsAssignment = relevantSignals.some((s) => s.kind === "assign_booth");
  const capacityExceeded = relevantSignals.some((s) => s.kind === "capacity_exceeded");
  return {
    hasBoothAssigned: !needsAssignment,
    boothCapacityExceeded: capacityExceeded,
  };
}
