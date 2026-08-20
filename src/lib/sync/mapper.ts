/**
 * OutboxItem → SyncQueueItem マッパー（IMP-032）。
 *
 * v2.0 §14: 既存の IndexedDB outbox（OutboxItem）を SYNC_CENTER 画面で
 * 扱える SyncQueueItem に変換する。新しい IDB ストアは作らない。
 * listOutbox() の結果をメモリ上でラップするビューレイヤ。
 *
 * ponytail: OutboxKind（5 種、UI アイコン用）→ SyncResourceType（8 種、
 * ドメインレベル）は多対一。"other" は URL パターンから推定し、
 * 不明なら "reservation" にフォールバック（最も頻度が高い操作）。
 */

import type { OutboxItem, OutboxKind } from "@/lib/outbox/types";
import type { SyncQueueItem, SyncResourceType } from "./types";

// ── OutboxKind → SyncResourceType 変換 ──

/**
 * OutboxKind から SyncResourceType への直接マッピング。
 * "other" は URL から推定するため含まない。
 */
const KIND_TO_RESOURCE: Record<Exclude<OutboxKind, "other">, SyncResourceType> = {
  certificate_create: "certificate",
  certificate_image_upload: "certificate_image",
  certificate_activate: "certificate",
  reservation_update: "reservation",
};

/**
 * URL パターンから SyncResourceType を推定する。
 * "other" OutboxKind のフォールバック用。
 *
 * ponytail: 既存 API ルート構造（/api/admin/{entity}/…）に合わせた
 * 最小パターン。新エンティティ追加時はここに 1 行追加。
 */
const URL_PATTERNS: ReadonlyArray<[RegExp, SyncResourceType]> = [
  [/\/api\/.*\/certificates?\b/, "certificate"],
  [/\/api\/.*\/certificate-images?\b/, "certificate_image"],
  [/\/api\/.*\/reservations?\b/, "reservation"],
  [/\/api\/.*\/customers?\b/, "customer"],
  [/\/api\/.*\/(invoices?|documents?)\b/, "invoice"],
  [/\/api\/.*\/vehicles?\b/, "vehicle"],
  [/\/api\/.*\/parts?(-installations?|_installations?)?\b/, "part_installation"],
  [/\/api\/.*\/(steps?|workflow|step-logs?)\b/, "work_step"],
];

/**
 * OutboxKind + URL から SyncResourceType を決定する。
 */
export function inferResourceType(kind: OutboxKind, url: string): SyncResourceType {
  if (kind !== "other") {
    return KIND_TO_RESOURCE[kind];
  }
  for (const [pattern, resourceType] of URL_PATTERNS) {
    if (pattern.test(url)) return resourceType;
  }
  // ponytail: 不明な URL は reservation フォールバック（最頻操作）。
  // 新 API ルート追加時に URL_PATTERNS を更新すれば解消。
  return "reservation";
}

// ── リソース ID 抽出 ──

/**
 * URL または bodyJson からリソース ID を抽出する。
 *
 * 優先順位:
 * 1. URL の末尾パスセグメントが UUID っぽければそれ
 * 2. bodyJson 内の id / public_id / reservation_id
 * 3. OutboxItem.id（最終フォールバック）
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractResourceId(item: OutboxItem): string {
  // URL 末尾セグメント
  try {
    const pathname = new URL(item.url, "https://dummy").pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop();
    if (lastSegment && UUID_LIKE.test(lastSegment)) return lastSegment;
  } catch {
    // URL パース失敗はフォールバックへ
  }

  // bodyJson から id 系フィールドを探す
  if (item.bodyJson) {
    try {
      const body = JSON.parse(item.bodyJson);
      if (typeof body === "object" && body !== null) {
        for (const key of ["id", "public_id", "reservation_id", "certificate_id"]) {
          if (typeof body[key] === "string" && body[key]) return body[key];
        }
      }
    } catch {
      // JSON パース失敗はフォールバックへ
    }
  }

  return item.id;
}

// ── テナント ID 抽出 ──

/**
 * OutboxItem からテナント ID を抽出する。
 *
 * ponytail: 現状 OutboxItem にテナント ID は明示的に含まれていない。
 * bodyJson 内の tenant_id / shop_id を探し、なければ "unknown" を返す。
 * 実運用上は各クライアントが単一テナントなので問題にならないが、
 * 将来の multi-tenant クライアント対応時に outbox に tenant_id を追加する。
 */
export function extractTenantId(item: OutboxItem): string {
  if (item.bodyJson) {
    try {
      const body = JSON.parse(item.bodyJson);
      if (typeof body === "object" && body !== null) {
        if (typeof body.tenant_id === "string" && body.tenant_id) return body.tenant_id;
        if (typeof body.shop_id === "string" && body.shop_id) return body.shop_id;
      }
    } catch {
      // フォールバック
    }
  }
  // ponytail: 単一テナントクライアントでは "unknown" で安全。
  return "unknown";
}

// ── メインマッパー ──

/**
 * OutboxItem を SyncQueueItem に変換する。
 *
 * 既存の OutboxItem の全フィールドを保持しつつ、
 * ドメインレベルの追跡情報を付加する。
 */
export function mapToSyncQueueItem(item: OutboxItem): SyncQueueItem {
  return {
    outboxItemId: item.id,
    resourceType: inferResourceType(item.kind, item.url),
    resourceId: extractResourceId(item),
    // ponytail: OutboxItem には syncState がない。
    // attempts > 0 + lastError ありなら FAILED、それ以外は PENDING。
    // SYNCING / CONFLICT は drain ループ中のみ発生（ここでは出ない）。
    syncState: item.attempts > 0 && item.lastError ? "FAILED" : "PENDING",
    tenantId: extractTenantId(item),
    createdAt: item.createdAt,
    lastSyncAt: item.lastAttemptAt,
    attempts: item.attempts,
    lastError: item.lastError,
    conflict: null,
  };
}

/**
 * OutboxItem 配列を SyncQueueItem 配列に一括変換する。
 * 重複検出付き: duplicate_pending 競合を自動付与する。
 */
export function mapOutboxToSyncQueue(items: readonly OutboxItem[]): SyncQueueItem[] {
  const mapped = items.map(mapToSyncQueueItem);

  // 重複検出
  const counts = new Map<string, number>();
  for (const item of mapped) {
    const key = `${item.resourceType}:${item.resourceId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // 重複アイテムに競合情報を付与
  for (const item of mapped) {
    const key = `${item.resourceType}:${item.resourceId}`;
    const count = counts.get(key) ?? 0;
    if (count > 1) {
      item.syncState = "CONFLICT";
      item.conflict = {
        kind: "duplicate_pending",
        detectedAt: Date.now(),
        description: `同一リソースへの未同期変更が ${count} 件あります`,
      };
    }
  }

  return mapped;
}
