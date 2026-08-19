/**
 * 同期キュー・競合解決基盤（IMP-016）。
 *
 * v2.0 §14: オフライン永続・同期キュー・競合の型と検出ロジック。
 * 既存の outbox インフラ（src/lib/outbox/）の上位レイヤとして、
 * ドメインレベルの同期追跡と競合解決を提供する。
 */

// 型
export type {
  SyncResourceType,
  SyncQueueItem,
  ConflictKind,
  SyncConflict,
  ConflictResolutionStrategy,
  ConflictResolution,
  SyncSummary,
} from "./types";

// 競合検出・解決
export {
  DEFAULT_RESOLUTION_STRATEGY,
  recommendedStrategy,
  detectConflictFromResponse,
  detectDuplicatePending,
} from "./conflict";
