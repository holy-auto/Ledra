/**
 * 競合検出・解決ヘルパー（IMP-016）。
 *
 * v2.0 §14: SyncState.CONFLICT の検出・解決ロジックの基盤。
 * リソースタイプごとのデフォルト解決戦略と、競合検出のユーティリティ。
 *
 * 実際の解決 UI は IMP-032（SYNC_CENTER）。ここでは判定ロジックのみ。
 */

import type { SyncResourceType, ConflictKind, SyncConflict, ConflictResolutionStrategy } from "./types";

// ── デフォルト解決戦略 ──

/**
 * リソースタイプごとのデフォルト競合解決戦略。
 *
 * ponytail: 証明書・部品装着は証跡整合性が最重要なので手動。
 * 予約・顧客など可逆な変更はクライアント優先で自動解決可能。
 * この表は SYNC_CENTER が解決ボタンの初期値として使う。
 */
export const DEFAULT_RESOLUTION_STRATEGY: Record<SyncResourceType, ConflictResolutionStrategy> = {
  certificate: "manual",
  certificate_image: "manual",
  reservation: "client_wins",
  customer: "client_wins",
  invoice: "manual",
  vehicle: "client_wins",
  part_installation: "manual",
  work_step: "client_wins",
};

/**
 * 競合種別ごとの推奨解決戦略。
 *
 * resource_deleted は常に手動（削除されたリソースへの変更は要確認）。
 * duplicate_pending は再試行（キュー内の重複は自然解消する可能性あり）。
 * version_mismatch はリソースタイプのデフォルトに従う。
 */
export function recommendedStrategy(kind: ConflictKind, resourceType: SyncResourceType): ConflictResolutionStrategy {
  switch (kind) {
    case "resource_deleted":
      return "manual";
    case "duplicate_pending":
      return "retry";
    case "version_mismatch":
      return DEFAULT_RESOLUTION_STRATEGY[resourceType];
  }
}

// ── 競合検出 ──

/**
 * HTTP レスポンスから競合を検出する。
 *
 * 409 Conflict はサーバ側で冪等性キーの不一致（既に別の内容で処理済み）。
 * 既存の drainItems は 409 を「成功扱い」にしているが、同期キュー層では
 * これを version_mismatch として記録する。
 *
 * 404 Not Found（PUT/PATCH 時）はリソース削除。
 * 410 Gone も同様。
 *
 * ponytail: 既存 outbox の drain ループは変更しない。この関数は
 * drain 結果を後処理する層（IMP-032）で使う。
 */
export function detectConflictFromResponse(
  status: number,
  method: string,
  serverMessage?: string,
): SyncConflict | null {
  // ponytail: POST 409 は冪等性衝突（既に処理済み＝成功扱い）であり、競合ではない。
  // 既存 drainItems も 409 を成功扱いにしている。PUT/PATCH 409 のみ version_mismatch。
  if (status === 409 && (method === "PUT" || method === "PATCH")) {
    return {
      kind: "version_mismatch",
      detectedAt: Date.now(),
      description: serverMessage ?? "サーバ側で変更が競合しています",
    };
  }
  if ((status === 404 || status === 410) && (method === "PUT" || method === "PATCH")) {
    return {
      kind: "resource_deleted",
      detectedAt: Date.now(),
      description: serverMessage ?? "対象リソースがサーバ上で削除されています",
    };
  }
  return null;
}

/**
 * 同一リソースへの重複キューアイテムを検出する。
 *
 * 同一 resourceType + resourceId を持つアイテムが複数あれば
 * duplicate_pending 競合を返す。
 */
export function detectDuplicatePending(
  items: ReadonlyArray<{ resourceType: string; resourceId: string }>,
): Map<string, SyncConflict> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.resourceType}:${item.resourceId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const conflicts = new Map<string, SyncConflict>();
  for (const [key, count] of counts) {
    if (count > 1) {
      conflicts.set(key, {
        kind: "duplicate_pending",
        detectedAt: Date.now(),
        description: `同一リソースへの未同期変更が ${count} 件あります`,
      });
    }
  }
  return conflicts;
}
