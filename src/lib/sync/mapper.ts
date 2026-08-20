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
import { detectDuplicatePending } from "./conflict";

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
// ponytail: certificate-image must precede certificate — \b treats
// hyphens as word boundaries, so /certificates?\b/ would match
// "certificate-images". More specific patterns first.
const URL_PATTERNS: ReadonlyArray<[RegExp, SyncResourceType]> = [
  [/\/api\/.*\/certificate-images?\b/, "certificate_image"],
  [/\/api\/.*\/certificates?\b/, "certificate"],
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

export function extractResourceId(item: OutboxItem, parsedBody?: Record<string, unknown> | null): string {
  // URL 末尾セグメント
  try {
    const pathname = new URL(item.url, "https://dummy").pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop();
    if (lastSegment && UUID_LIKE.test(lastSegment)) return lastSegment;
  } catch {
    // URL パース失敗はフォールバックへ
  }

  // bodyJson から id 系フィールドを探す
  const body = parsedBody ?? parseBody(item.bodyJson);
  if (body) {
    for (const key of ["id", "public_id", "reservation_id", "certificate_id"]) {
      if (typeof body[key] === "string" && body[key]) return body[key] as string;
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
export function extractTenantId(item: OutboxItem, parsedBody?: Record<string, unknown> | null): string {
  const body = parsedBody ?? parseBody(item.bodyJson);
  if (body) {
    if (typeof body.tenant_id === "string" && body.tenant_id) return body.tenant_id;
    if (typeof body.shop_id === "string" && body.shop_id) return body.shop_id;
  }
  // ponytail: 単一テナントクライアントでは "unknown" で安全。
  return "unknown";
}

// ── bodyJson パーサー ──

/** bodyJson を 1 回だけパースし、Object でなければ null を返す。 */
function parseBody(bodyJson: string | null): Record<string, unknown> | null {
  if (!bodyJson) return null;
  try {
    const parsed = JSON.parse(bodyJson);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

// ── メインマッパー ──

/**
 * OutboxItem を SyncQueueItem に変換する。
 *
 * 既存の OutboxItem の全フィールドを保持しつつ、
 * ドメインレベルの追跡情報を付加する。
 */
export function mapToSyncQueueItem(item: OutboxItem): SyncQueueItem {
  // ponytail: bodyJson を 1 回だけパースし、両抽出関数に渡す。
  const body = parseBody(item.bodyJson);
  return {
    outboxItemId: item.id,
    resourceType: inferResourceType(item.kind, item.url),
    resourceId: extractResourceId(item, body),
    // ponytail: OutboxItem には syncState がない。
    // attempts > 0 + lastError ありなら FAILED、それ以外は PENDING。
    // SYNCING / CONFLICT は drain ループ中のみ発生（ここでは出ない）。
    syncState: item.attempts > 0 && item.lastError ? "FAILED" : "PENDING",
    tenantId: extractTenantId(item, body),
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
 * FAILED 状態のアイテムは重複があっても FAILED を維持する（情報を失わない）。
 */
export function mapOutboxToSyncQueue(items: readonly OutboxItem[]): SyncQueueItem[] {
  const mapped = items.map(mapToSyncQueueItem);

  // detectDuplicatePending を再利用（conflict.ts の単一定義源）
  const duplicates = detectDuplicatePending(mapped);

  for (const item of mapped) {
    const key = `${item.resourceType}:${item.resourceId}`;
    const conflict = duplicates.get(key);
    if (conflict) {
      // ponytail: FAILED アイテムは FAILED を維持し、conflict だけ付与する。
      // FAILED の lastError 情報を CONFLICT で上書きしない。
      if (item.syncState !== "FAILED") {
        item.syncState = "CONFLICT";
      }
      item.conflict = conflict;
    }
  }

  return mapped;
}
