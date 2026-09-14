/**
 * IMP-044: 統一優先度スコアリングサービス。
 *
 * v2.0 §20.2: Priority/NEXT ACTION エンジン。
 * 3 つの独立したシグナルソース（ダッシュボードタイル / ジョブ次アクション /
 * 顧客シグナル）+ ブースシグナル（IMP-041）を単一のスコア付きキューに正規化する。
 *
 * 設計判断:
 * - 各ソースは独自の priority 表現を持つ（数値 0-3 / "high"|"med"|"low" /
 *   "high"|"medium"|"low"）。本モジュールが統一スコア（0-100, 高い=緊急）に正規化。
 * - 説明可能性: 全 ScoredAction に人間可読な reason + 元ソースを保持。
 * - 重複排除: actionKey（ソース:アクションID）でユニーク化。同一キーはスコア最大を採用。
 *
 * ponytail: 型と純関数のみ。IO なし。
 */

import type { TaskTile } from "@/lib/admin/todayTasks";
import type { JobNextActionSuggestion } from "@/lib/ai/jobNextAction";
import type { NextAction } from "@/lib/customers/signals";
import type { BoothSignal } from "@/lib/booths/boothSignals";

// ── 型 ──

/** シグナルの出自。UI でフィルタ・アイコン分岐に使う。 */
export type SignalSource = "dashboard" | "job" | "customer" | "booth";

/**
 * 統一スコア付きアクション。全シグナルソースをこの型に正規化する。
 *
 * score: 0-100（高い = 緊急）。
 * reason: スタッフ向けの説明（なぜこのアクションが上位か）。
 */
export interface ScoredAction {
  /** 重複排除キー（例: "dashboard:overdue_invoices", "job:res-1:follow_up_overdue"）。 */
  actionKey: string;
  /** スコア 0-100。高い = 緊急。 */
  score: number;
  /** ソース種別。 */
  source: SignalSource;
  /** スタッフ向けラベル。 */
  label: string;
  /** スコアの理由（説明可能性）。 */
  reason: string;
  /** 遷移先 URL（あれば）。 */
  href?: string;
  /** 元のアクション ID（ソース固有）。 */
  originalId: string;
  /** 関連エンティティ ID（予約 / 顧客 / ブース等）。 */
  entityId?: string;
}

// ── スコア正規化 ──

/**
 * ダッシュボードタイルの priority（0=urgent, 3=low）→ 統一スコア。
 *
 * 0 → 90, 1 → 70, 2 → 50, 3 → 30。
 * count でボーナス（件数が多いほどスコア加算、最大 +10）。
 */
export function scoreTile(tile: Pick<TaskTile, "priority" | "count" | "id" | "label" | "hint" | "href">): ScoredAction {
  const base = [90, 70, 50, 30][tile.priority] ?? 30;
  const countBonus = Math.min(10, Math.floor(tile.count / 2));
  return {
    actionKey: `dashboard:${tile.id}`,
    score: Math.min(100, base + countBonus),
    source: "dashboard",
    label: tile.label,
    reason: tile.hint,
    href: tile.href,
    originalId: tile.id,
  };
}

/**
 * ジョブ次アクションの priority（"high"|"med"|"low"）→ 統一スコア。
 *
 * high → 85, med → 60, low → 35。
 */
export function scoreJobSuggestion(
  suggestion: Pick<JobNextActionSuggestion, "action" | "message" | "priority">,
  reservationId: string,
): ScoredAction {
  const base = { high: 85, med: 60, low: 35 }[suggestion.priority];
  return {
    actionKey: `job:${reservationId}:${suggestion.action}`,
    score: base,
    source: "job",
    label: suggestion.message,
    reason: `案件 ${reservationId} の次アクション`,
    originalId: suggestion.action,
    entityId: reservationId,
  };
}

/**
 * 顧客シグナルの priority（"high"|"medium"|"low"）→ 統一スコア。
 *
 * high → 80, medium → 55, low → 30。
 */
export function scoreCustomerAction(
  action: Pick<NextAction, "id" | "label" | "reason" | "cta" | "priority">,
  customerId: string,
): ScoredAction {
  const base = { high: 80, medium: 55, low: 30 }[action.priority];
  return {
    actionKey: `customer:${customerId}:${action.id}`,
    score: base,
    source: "customer",
    label: action.label,
    reason: action.reason,
    href: action.cta.href,
    originalId: action.id,
    entityId: customerId,
  };
}

/**
 * ブースシグナルの priority（"high"|"med"|"low"）→ 統一スコア。
 *
 * high → 88, med → 62, low → 38。
 * ブース問題は安全・運営に直結するため job よりわずかに高め。
 */
export function scoreBoothSignal(
  signal: Pick<BoothSignal, "kind" | "boothId" | "message" | "priority" | "reservationIds">,
): ScoredAction {
  const base = { high: 88, med: 62, low: 38 }[signal.priority];
  return {
    // reservationIds も含める — 同じブース・同じ kind でも時間帯が異なる複数の
    // capacity_exceeded ウィンドウが同時に存在しうるため、boothId:kind だけでは
    // scoreAndRank の重複排除が別ウィンドウの警告を誤って1件に潰してしまう。
    actionKey: `booth:${signal.boothId ?? "unassigned"}:${signal.kind}:${signal.reservationIds.join(",")}`,
    score: base,
    source: "booth",
    label: signal.message,
    reason: `ブース ${signal.boothId ? `(${signal.boothId})` : "(未割当)"} の状態`,
    originalId: signal.kind,
    entityId: signal.boothId ?? undefined,
  };
}

// ── 統合スコアリング ──

/** scoreAndRank の入力。全フィールドオプショナル（利用可能なソースのみ渡す）。 */
export interface ScoreInput {
  tiles?: ReadonlyArray<Pick<TaskTile, "priority" | "count" | "id" | "label" | "hint" | "href">>;
  jobSuggestions?: ReadonlyArray<{
    reservationId: string;
    suggestion: Pick<JobNextActionSuggestion, "action" | "message" | "priority">;
  }>;
  customerActions?: ReadonlyArray<{
    customerId: string;
    action: Pick<NextAction, "id" | "label" | "reason" | "cta" | "priority">;
  }>;
  boothSignals?: ReadonlyArray<Pick<BoothSignal, "kind" | "boothId" | "message" | "priority" | "reservationIds">>;
}

/**
 * 全シグナルソースを統一スコアに正規化し、重複排除・降順ソートする。
 *
 * 同一 actionKey は最高スコアを採用（異なるソースが同じ問題を指す場合）。
 * limit で上位 N 件に絞れる（デフォルト: 全件）。
 */
export function scoreAndRank(input: ScoreInput, limit?: number): ScoredAction[] {
  const all: ScoredAction[] = [];

  for (const tile of input.tiles ?? []) {
    all.push(scoreTile(tile));
  }
  for (const { reservationId, suggestion } of input.jobSuggestions ?? []) {
    all.push(scoreJobSuggestion(suggestion, reservationId));
  }
  for (const { customerId, action } of input.customerActions ?? []) {
    all.push(scoreCustomerAction(action, customerId));
  }
  for (const signal of input.boothSignals ?? []) {
    all.push(scoreBoothSignal(signal));
  }

  // 重複排除: 同一 actionKey はスコア最大を採用
  const deduped = new Map<string, ScoredAction>();
  for (const a of all) {
    const existing = deduped.get(a.actionKey);
    if (!existing || a.score > existing.score) {
      deduped.set(a.actionKey, a);
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => b.score - a.score);
  return limit != null ? sorted.slice(0, limit) : sorted;
}
