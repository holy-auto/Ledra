/**
 * 同期サマリー計算（IMP-032）。
 *
 * v2.0 §14: SyncQueueItem 配列から SYNC_CENTER ヘッダ・
 * ナビゲーションバッジ用の集計サマリーを計算する純関数。
 */

import type { SyncQueueItem, SyncSummary } from "./types";

/**
 * SyncQueueItem 配列から SyncSummary を計算する。
 *
 * 空配列 → total:0、oldestPendingSince:null の空サマリー。
 */
export function computeSyncSummary(items: readonly SyncQueueItem[]): SyncSummary {
  let pending = 0;
  let syncing = 0;
  let failed = 0;
  let conflicted = 0;
  let oldestPendingSince: number | null = null;

  for (const item of items) {
    switch (item.syncState) {
      case "PENDING":
        pending++;
        break;
      case "SYNCING":
        syncing++;
        break;
      case "FAILED":
        failed++;
        break;
      case "CONFLICT":
        conflicted++;
        break;
      // SYNCED は同期済み（キューから消えるはず）だがカウントしない
    }

    // 未同期（PENDING/SYNCING/FAILED/CONFLICT）の最古
    if (item.syncState !== "SYNCED") {
      if (oldestPendingSince === null || item.createdAt < oldestPendingSince) {
        oldestPendingSince = item.createdAt;
      }
    }
  }

  return {
    total: items.length,
    pending,
    syncing,
    failed,
    conflicted,
    oldestPendingSince,
  };
}

/**
 * サマリーに要注意アイテム（FAILED + CONFLICT）があるかを判定する。
 * ナビゲーションバッジの表示判定用。
 */
export function hasAttentionItems(summary: SyncSummary): boolean {
  return summary.failed > 0 || summary.conflicted > 0;
}

/**
 * サマリーのバッジ表示用カウント。
 * 要注意（FAILED + CONFLICT）があればその合計、なければ未同期の合計。
 * 0 ならバッジ非表示。
 */
export function syncBadgeCount(summary: SyncSummary): number {
  const attention = summary.failed + summary.conflicted;
  if (attention > 0) return attention;
  return summary.pending + summary.syncing;
}
