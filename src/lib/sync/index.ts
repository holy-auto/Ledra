/**
 * 同期キュー・競合解決基盤（IMP-016 / IMP-032）。
 *
 * v2.0 §14: オフライン永続・同期キュー・競合の型と検出ロジック。
 * 既存の outbox インフラ（src/lib/outbox/）の上位レイヤとして、
 * ドメインレベルの同期追跡と競合解決を提供する。
 *
 * IMP-032: OutboxItem → SyncQueueItem マッパー、サマリー計算、
 * 競合解決実行ロジックを追加。
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

// OutboxItem → SyncQueueItem マッパー (IMP-032)
export {
  inferResourceType,
  extractResourceId,
  extractTenantId,
  mapToSyncQueueItem,
  mapOutboxToSyncQueue,
} from "./mapper";

// サマリー計算 (IMP-032)
export { computeSyncSummary, hasAttentionItems, syncBadgeCount } from "./summary";

// 競合解決実行 (IMP-032)
export type { ResolutionAction } from "./resolver";
export {
  resolveAction,
  createResolution,
  applyResolution,
  canAutoResolve,
  autoResolve,
  autoResolveAll,
} from "./resolver";
