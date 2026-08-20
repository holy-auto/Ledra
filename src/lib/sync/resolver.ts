/**
 * 競合解決実行ロジック（IMP-032）。
 *
 * v2.0 §14: SYNC_CENTER 画面で選択された解決戦略を適用し、
 * SyncQueueItem の状態遷移と解決レコードを生成する純関数群。
 *
 * 実際の IndexedDB 操作（removeOutboxItem, markOutboxAttempt）は
 * 呼び出し側が行う。ここでは「何をすべきか」を決定するのみ。
 */

import type { SyncQueueItem, SyncConflict, ConflictResolutionStrategy, ConflictResolution } from "./types";
import { recommendedStrategy } from "./conflict";

// ── 解決アクション ──

/**
 * 解決戦略の適用結果。呼び出し側はこれに基づいて実際の I/O を行う。
 */
export type ResolutionAction =
  | { type: "retry" /** キューに残し PENDING に戻す */ }
  | { type: "discard" /** キューから削除（server_wins） */ }
  | { type: "force_push" /** ヘッダに強制上書きフラグを付けて再試行 */ }
  | { type: "await_manual" /** UI で手動解決を待つ（状態変更なし） */ };

/**
 * 解決戦略から具体的なアクションを決定する。
 */
export function resolveAction(strategy: ConflictResolutionStrategy): ResolutionAction {
  switch (strategy) {
    case "retry":
      return { type: "retry" };
    case "server_wins":
      return { type: "discard" };
    case "client_wins":
      return { type: "force_push" };
    case "manual":
      return { type: "await_manual" };
  }
}

// ── 解決レコード生成 ──

/**
 * 競合解決レコードを生成する。
 *
 * resolvedAt は呼び出し時の now を受け取る（テスタビリティ）。
 */
export function createResolution(
  conflict: SyncConflict,
  strategy: ConflictResolutionStrategy,
  resolvedBy: "user" | "auto",
  now: number,
): ConflictResolution {
  return {
    conflict,
    strategy,
    resolvedAt: now,
    resolvedBy,
  };
}

// ── 解決適用 ──

/**
 * SyncQueueItem に解決戦略を適用した新しいアイテムを返す。
 * 元のアイテムは変更しない（不変更新）。
 *
 * - retry / force_push → PENDING に戻す、conflict をクリア
 * - server_wins → null（呼び出し側がキューから削除）
 * - manual → そのまま返す（状態変更なし）
 */
export function applyResolution(item: SyncQueueItem, strategy: ConflictResolutionStrategy): SyncQueueItem | null {
  switch (strategy) {
    case "retry":
    case "client_wins":
      return {
        ...item,
        syncState: "PENDING",
        conflict: null,
        lastError: null,
      };
    case "server_wins":
      // 呼び出し側がキューから削除する
      return null;
    case "manual":
      // UI で手動解決を待つ — 状態変更なし
      return item;
  }
}

// ── 自動解決 ──

/**
 * 自動解決可能な競合かを判定する。
 *
 * ponytail: duplicate_pending は常に retry で自動解決可能。
 * version_mismatch / resource_deleted のうち、リソースタイプの
 * デフォルト戦略が "manual" でないものも自動解決可能。
 */
export function canAutoResolve(item: SyncQueueItem): boolean {
  if (!item.conflict) return false;
  const strategy = recommendedStrategy(item.conflict.kind, item.resourceType);
  return strategy !== "manual";
}

/**
 * 自動解決を適用する。
 *
 * canAutoResolve が true のアイテムに対してのみ呼ぶこと。
 * false のアイテムに呼んだ場合は変更なしでそのまま返す。
 */
export function autoResolve(
  item: SyncQueueItem,
  now: number,
): { item: SyncQueueItem | null; resolution: ConflictResolution | null } {
  if (!item.conflict) return { item, resolution: null };

  const strategy = recommendedStrategy(item.conflict.kind, item.resourceType);
  if (strategy === "manual") return { item, resolution: null };

  const resolution = createResolution(item.conflict, strategy, "auto", now);
  const resolved = applyResolution(item, strategy);
  return { item: resolved, resolution };
}

/**
 * キュー全体に自動解決を適用する。
 *
 * 戻り値: 解決後のアイテム配列（server_wins で削除されたものは除外）
 * + 生成された解決レコード配列。
 */
export function autoResolveAll(
  items: readonly SyncQueueItem[],
  now: number,
): { items: SyncQueueItem[]; resolutions: ConflictResolution[] } {
  const resolved: SyncQueueItem[] = [];
  const resolutions: ConflictResolution[] = [];

  for (const item of items) {
    if (!item.conflict || !canAutoResolve(item)) {
      resolved.push(item);
      continue;
    }
    const result = autoResolve(item, now);
    if (result.item) resolved.push(result.item);
    if (result.resolution) resolutions.push(result.resolution);
  }

  return { items: resolved, resolutions };
}
