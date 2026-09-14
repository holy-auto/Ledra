/**
 * ブース状態から NEXT ACTION シグナルを導出（IMP-041）。
 *
 * IMP-044（Priority/NEXT ACTION エンジン）の前提条件。
 * pickJobNextActionCandidate() 自体の booth 拡張は IMP-044 で行う。
 * ここではシグナルの型定義と導出ロジックのみ。
 *
 * DB・API・UI の変更なし（型基盤先行パターン）。
 */
import type { BoothInfo, BoothReservation } from "./occupancy";
import { detectCapacityConflicts, computeBoothUtilization, NON_OCCUPYING } from "./occupancy";

// ── 型 ──

export type BoothSignalKind =
  /** ブースが空いた — 待機ジョブに割当可能 */
  | "booth_freed"
  /** ジョブにブース未割当 */
  | "assign_booth"
  /** 定員超過 */
  | "capacity_exceeded"
  /** 稼働率が閾値超え（過負荷警告） */
  | "booth_overloaded";

export interface BoothSignal {
  kind: BoothSignalKind;
  boothId: string | null;
  boothName: string | null;
  /** 関連する予約 ID */
  reservationIds: string[];
  /** スタッフ向けメッセージ（60 字以内） */
  message: string;
  priority: "high" | "med" | "low";
}

export interface BoothSignalInput {
  booths: readonly BoothInfo[];
  /** 当日の全予約（全ブース分） */
  reservations: readonly BoothReservation[];
  /** 現在時刻（時単位、例: 10.5 = 10:30） */
  nowHours: number;
  /** 稼働率警告閾値 (0–100)。デフォルト 90。 */
  utilizationThreshold?: number;
}

// ── 導出 ──

/** 稼働率のデフォルト警告閾値 */
const DEFAULT_UTILIZATION_THRESHOLD = 90;

/**
 * ブースの状態と予約からアクション可能なシグナルを導出する。
 *
 * 戻り値は priority の高い順（high → med → low）。
 */
export function deriveBoothSignals(input: BoothSignalInput): BoothSignal[] {
  const { booths, reservations, nowHours, utilizationThreshold = DEFAULT_UTILIZATION_THRESHOLD } = input;

  const signals: BoothSignal[] = [];

  // 1. ブース未割当のアクティブ予約
  const unassigned = reservations.filter((r) => !r.boothId && !NON_OCCUPYING.has(r.status));
  if (unassigned.length > 0) {
    signals.push({
      kind: "assign_booth",
      boothId: null,
      boothName: null,
      reservationIds: unassigned.map((r) => r.id),
      message:
        unassigned.length === 1
          ? "ブース未割当の予約が1件あります。"
          : `ブース未割当の予約が${unassigned.length}件あります。`,
      priority: unassigned.some((r) => r.status === "in_progress" || r.status === "arrived") ? "high" : "med",
    });
  }

  // 2. ブースごとのチェック
  for (const booth of booths) {
    if (!booth.isActive) continue;

    const boothRes = reservations.filter((r) => r.boothId === booth.id);
    if (boothRes.length === 0) continue;

    // 定員超過・空き判定には終端ステータスを除外（占有していない）
    const activeBoothRes = boothRes.filter((r) => !NON_OCCUPYING.has(r.status));

    // 2a. 定員超過
    const conflicts = detectCapacityConflicts(booth, activeBoothRes);
    for (const c of conflicts) {
      // nowHours が超過区間に含まれるか今後にあるもののみ
      if (c.window.end > nowHours) {
        signals.push({
          kind: "capacity_exceeded",
          boothId: booth.id,
          boothName: booth.name,
          reservationIds: c.reservationIds,
          message: `${booth.name}が${c.peakConcurrent}/${c.capacity}台で定員超過です。`,
          priority: "high",
        });
      }
    }

    // 2b. 稼働率過負荷
    const util = computeBoothUtilization(booth, boothRes);
    if (util.utilizationPct >= utilizationThreshold) {
      signals.push({
        kind: "booth_overloaded",
        boothId: booth.id,
        boothName: booth.name,
        reservationIds: boothRes.map((r) => r.id),
        message: `${booth.name}の稼働率が${util.utilizationPct}%です。`,
        priority: "med",
      });
    }

    // 2c. ブースが空いた（直前の予約が完了・現在空き）
    const justCompleted = boothRes.filter((r) => r.status === "completed");
    const activeNow = boothRes.filter((r) => r.status === "in_progress");
    if (justCompleted.length > 0 && activeNow.length === 0) {
      // 待機中の予約があるか
      const waiting = reservations.filter((r) => !r.boothId && (r.status === "confirmed" || r.status === "arrived"));
      if (waiting.length > 0) {
        signals.push({
          kind: "booth_freed",
          boothId: booth.id,
          boothName: booth.name,
          reservationIds: waiting.slice(0, 3).map((r) => r.id),
          message: `${booth.name}が空きました。待機中の予約を割り当てできます。`,
          priority: "med",
        });
      }
    }
  }

  // priority 順にソート (high > med > low)
  const ORDER: Record<string, number> = { high: 0, med: 1, low: 2 };
  signals.sort((a, b) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9));

  return signals;
}
