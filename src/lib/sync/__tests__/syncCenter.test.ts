import { describe, it, expect } from "vitest";
import type { OutboxItem } from "@/lib/outbox/types";
import type { SyncQueueItem } from "../types";
import {
  inferResourceType,
  extractResourceId,
  extractTenantId,
  mapToSyncQueueItem,
  mapOutboxToSyncQueue,
} from "../mapper";
import { computeSyncSummary, hasAttentionItems, syncBadgeCount } from "../summary";
import {
  resolveAction,
  createResolution,
  applyResolution,
  canAutoResolve,
  autoResolve,
  autoResolveAll,
} from "../resolver";

// ── テストヘルパー ──

function makeOutboxItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: "item-001",
    url: "/api/admin/reservations/abc-def-123",
    method: "PUT",
    bodyJson: null,
    label: "テスト",
    kind: "reservation_update",
    createdAt: 1000,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeSyncItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    outboxItemId: "item-001",
    resourceType: "reservation",
    resourceId: "res-001",
    syncState: "PENDING",
    tenantId: "tenant-1",
    createdAt: 1000,
    lastSyncAt: null,
    attempts: 0,
    lastError: null,
    conflict: null,
    ...overrides,
  };
}

// ── inferResourceType ──

describe("inferResourceType()", () => {
  it("certificate_create → certificate", () => {
    expect(inferResourceType("certificate_create", "/api/admin/certificates")).toBe("certificate");
  });

  it("certificate_image_upload → certificate_image", () => {
    expect(inferResourceType("certificate_image_upload", "/api/admin/certificate-images")).toBe("certificate_image");
  });

  it("certificate_activate → certificate", () => {
    expect(inferResourceType("certificate_activate", "/api/admin/certificates/x/activate")).toBe("certificate");
  });

  it("reservation_update → reservation", () => {
    expect(inferResourceType("reservation_update", "/api/admin/reservations/x")).toBe("reservation");
  });

  it("other + customer URL → customer", () => {
    expect(inferResourceType("other", "/api/admin/customers/abc")).toBe("customer");
  });

  it("other + vehicle URL → vehicle", () => {
    expect(inferResourceType("other", "/api/admin/vehicles/abc")).toBe("vehicle");
  });

  it("other + invoice URL → invoice", () => {
    expect(inferResourceType("other", "/api/admin/invoices/abc")).toBe("invoice");
  });

  it("other + documents URL → invoice", () => {
    expect(inferResourceType("other", "/api/admin/documents/abc")).toBe("invoice");
  });

  it("other + parts URL → part_installation", () => {
    expect(inferResourceType("other", "/api/admin/parts-installations/abc")).toBe("part_installation");
  });

  it("other + step-logs URL → work_step", () => {
    expect(inferResourceType("other", "/api/admin/step-logs/abc")).toBe("work_step");
  });

  it("other + workflow URL → work_step", () => {
    expect(inferResourceType("other", "/api/admin/workflow/templates")).toBe("work_step");
  });

  it("other + 不明な URL → reservation（フォールバック）", () => {
    expect(inferResourceType("other", "/api/admin/unknown/thing")).toBe("reservation");
  });
});

// ── extractResourceId ──

describe("extractResourceId()", () => {
  it("URL 末尾の UUID を抽出する", () => {
    const item = makeOutboxItem({
      url: "/api/admin/reservations/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(extractResourceId(item)).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("URL に UUID がなければ bodyJson の id を使う", () => {
    const item = makeOutboxItem({
      url: "/api/admin/reservations",
      bodyJson: JSON.stringify({ id: "body-id-001" }),
    });
    expect(extractResourceId(item)).toBe("body-id-001");
  });

  it("bodyJson の public_id を使う", () => {
    const item = makeOutboxItem({
      url: "/api/admin/certificates",
      bodyJson: JSON.stringify({ public_id: "pub-id-001" }),
    });
    expect(extractResourceId(item)).toBe("pub-id-001");
  });

  it("どれもなければ OutboxItem.id にフォールバック", () => {
    const item = makeOutboxItem({
      id: "fallback-id",
      url: "/api/admin/things",
      bodyJson: null,
    });
    expect(extractResourceId(item)).toBe("fallback-id");
  });
});

// ── extractTenantId ──

describe("extractTenantId()", () => {
  it("bodyJson の tenant_id を抽出する", () => {
    const item = makeOutboxItem({
      bodyJson: JSON.stringify({ tenant_id: "t-123" }),
    });
    expect(extractTenantId(item)).toBe("t-123");
  });

  it("bodyJson の shop_id にフォールバック", () => {
    const item = makeOutboxItem({
      bodyJson: JSON.stringify({ shop_id: "s-456" }),
    });
    expect(extractTenantId(item)).toBe("s-456");
  });

  it("bodyJson なし → 'unknown'", () => {
    const item = makeOutboxItem({ bodyJson: null });
    expect(extractTenantId(item)).toBe("unknown");
  });
});

// ── mapToSyncQueueItem ──

describe("mapToSyncQueueItem()", () => {
  it("正常な OutboxItem を変換する", () => {
    const item = makeOutboxItem();
    const result = mapToSyncQueueItem(item);
    expect(result.outboxItemId).toBe("item-001");
    expect(result.resourceType).toBe("reservation");
    expect(result.syncState).toBe("PENDING");
    expect(result.conflict).toBeNull();
  });

  it("エラーあり + attempts > 0 → FAILED", () => {
    const item = makeOutboxItem({
      attempts: 3,
      lastError: "HTTP 500",
      lastAttemptAt: 2000,
    });
    const result = mapToSyncQueueItem(item);
    expect(result.syncState).toBe("FAILED");
    expect(result.lastError).toBe("HTTP 500");
    expect(result.attempts).toBe(3);
  });

  it("attempts > 0 でもエラーなし → PENDING", () => {
    const item = makeOutboxItem({ attempts: 1, lastError: null });
    const result = mapToSyncQueueItem(item);
    expect(result.syncState).toBe("PENDING");
  });
});

// ── mapOutboxToSyncQueue ──

describe("mapOutboxToSyncQueue()", () => {
  it("空配列 → 空配列", () => {
    expect(mapOutboxToSyncQueue([])).toEqual([]);
  });

  it("重複なし → CONFLICT なし", () => {
    const items = [
      makeOutboxItem({ id: "a", url: "/api/admin/reservations/uuid-1" }),
      makeOutboxItem({
        id: "b",
        kind: "certificate_create",
        url: "/api/admin/certificates/uuid-2",
      }),
    ];
    const result = mapOutboxToSyncQueue(items);
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.conflict === null)).toBe(true);
  });

  it("同一リソースの重複 → duplicate_pending 競合が付与される", () => {
    const items = [
      makeOutboxItem({ id: "a", url: "/api/admin/reservations/a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
      makeOutboxItem({ id: "b", url: "/api/admin/reservations/a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    ];
    const result = mapOutboxToSyncQueue(items);
    expect(result).toHaveLength(2);
    expect(result[0].syncState).toBe("CONFLICT");
    expect(result[0].conflict?.kind).toBe("duplicate_pending");
    expect(result[1].syncState).toBe("CONFLICT");
  });
});

// ── computeSyncSummary ──

describe("computeSyncSummary()", () => {
  it("空配列 → 全ゼロサマリー", () => {
    const summary = computeSyncSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.syncing).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.conflicted).toBe(0);
    expect(summary.oldestPendingSince).toBeNull();
  });

  it("混在状態を正しくカウントする", () => {
    const items: SyncQueueItem[] = [
      makeSyncItem({ syncState: "PENDING", createdAt: 100 }),
      makeSyncItem({ syncState: "PENDING", createdAt: 200 }),
      makeSyncItem({ syncState: "SYNCING", createdAt: 300 }),
      makeSyncItem({ syncState: "FAILED", createdAt: 50 }),
      makeSyncItem({ syncState: "CONFLICT", createdAt: 150 }),
    ];
    const summary = computeSyncSummary(items);
    expect(summary.total).toBe(5);
    expect(summary.pending).toBe(2);
    expect(summary.syncing).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.conflicted).toBe(1);
    expect(summary.oldestPendingSince).toBe(50);
  });

  it("SYNCED アイテムは状態別カウントに含まれない", () => {
    const items: SyncQueueItem[] = [
      makeSyncItem({ syncState: "SYNCED", createdAt: 100 }),
      makeSyncItem({ syncState: "PENDING", createdAt: 200 }),
    ];
    const summary = computeSyncSummary(items);
    expect(summary.total).toBe(2);
    expect(summary.pending).toBe(1);
    // SYNCED は oldestPendingSince に影響しない
    expect(summary.oldestPendingSince).toBe(200);
  });
});

// ── hasAttentionItems ──

describe("hasAttentionItems()", () => {
  it("failed > 0 → true", () => {
    expect(
      hasAttentionItems({ total: 1, pending: 0, syncing: 0, failed: 1, conflicted: 0, oldestPendingSince: null }),
    ).toBe(true);
  });

  it("conflicted > 0 → true", () => {
    expect(
      hasAttentionItems({ total: 1, pending: 0, syncing: 0, failed: 0, conflicted: 1, oldestPendingSince: null }),
    ).toBe(true);
  });

  it("pending のみ → false", () => {
    expect(
      hasAttentionItems({ total: 1, pending: 1, syncing: 0, failed: 0, conflicted: 0, oldestPendingSince: null }),
    ).toBe(false);
  });

  it("空サマリー → false", () => {
    expect(
      hasAttentionItems({ total: 0, pending: 0, syncing: 0, failed: 0, conflicted: 0, oldestPendingSince: null }),
    ).toBe(false);
  });
});

// ── syncBadgeCount ──

describe("syncBadgeCount()", () => {
  it("要注意があればその合計を返す", () => {
    expect(
      syncBadgeCount({ total: 5, pending: 2, syncing: 1, failed: 1, conflicted: 1, oldestPendingSince: null }),
    ).toBe(2); // failed + conflicted
  });

  it("要注意なしなら未同期の合計を返す", () => {
    expect(
      syncBadgeCount({ total: 3, pending: 2, syncing: 1, failed: 0, conflicted: 0, oldestPendingSince: null }),
    ).toBe(3); // pending + syncing
  });

  it("全ゼロ → 0", () => {
    expect(
      syncBadgeCount({ total: 0, pending: 0, syncing: 0, failed: 0, conflicted: 0, oldestPendingSince: null }),
    ).toBe(0);
  });
});

// ── resolveAction ──

describe("resolveAction()", () => {
  it("retry → retry", () => {
    expect(resolveAction("retry")).toEqual({ type: "retry" });
  });

  it("server_wins → discard", () => {
    expect(resolveAction("server_wins")).toEqual({ type: "discard" });
  });

  it("client_wins → force_push", () => {
    expect(resolveAction("client_wins")).toEqual({ type: "force_push" });
  });

  it("manual → await_manual", () => {
    expect(resolveAction("manual")).toEqual({ type: "await_manual" });
  });
});

// ── createResolution ──

describe("createResolution()", () => {
  it("解決レコードを生成する", () => {
    const conflict = { kind: "version_mismatch" as const, detectedAt: 1000, description: "test" };
    const resolution = createResolution(conflict, "client_wins", "user", 2000);
    expect(resolution.conflict).toBe(conflict);
    expect(resolution.strategy).toBe("client_wins");
    expect(resolution.resolvedAt).toBe(2000);
    expect(resolution.resolvedBy).toBe("user");
  });
});

// ── applyResolution ──

describe("applyResolution()", () => {
  const conflictItem = makeSyncItem({
    syncState: "CONFLICT",
    conflict: { kind: "version_mismatch", detectedAt: 1000, description: "test" },
    lastError: "HTTP 409",
  });

  it("retry → PENDING に戻す", () => {
    const result = applyResolution(conflictItem, "retry");
    expect(result).not.toBeNull();
    expect(result!.syncState).toBe("PENDING");
    expect(result!.conflict).toBeNull();
    expect(result!.lastError).toBeNull();
  });

  it("client_wins → PENDING に戻す", () => {
    const result = applyResolution(conflictItem, "client_wins");
    expect(result).not.toBeNull();
    expect(result!.syncState).toBe("PENDING");
  });

  it("server_wins → null（削除指示）", () => {
    const result = applyResolution(conflictItem, "server_wins");
    expect(result).toBeNull();
  });

  it("manual → 変更なし", () => {
    const result = applyResolution(conflictItem, "manual");
    expect(result).toBe(conflictItem);
  });

  it("元のアイテムを変更しない（不変更新）", () => {
    applyResolution(conflictItem, "retry");
    expect(conflictItem.syncState).toBe("CONFLICT");
    expect(conflictItem.conflict).not.toBeNull();
  });
});

// ── canAutoResolve ──

describe("canAutoResolve()", () => {
  it("conflict なし → false", () => {
    expect(canAutoResolve(makeSyncItem())).toBe(false);
  });

  it("duplicate_pending → true（デフォルト: retry）", () => {
    const item = makeSyncItem({
      syncState: "CONFLICT",
      conflict: { kind: "duplicate_pending", detectedAt: 1000, description: "重複" },
    });
    expect(canAutoResolve(item)).toBe(true);
  });

  it("version_mismatch + reservation → true（デフォルト: client_wins）", () => {
    const item = makeSyncItem({
      resourceType: "reservation",
      syncState: "CONFLICT",
      conflict: { kind: "version_mismatch", detectedAt: 1000, description: "競合" },
    });
    expect(canAutoResolve(item)).toBe(true);
  });

  it("version_mismatch + certificate → false（デフォルト: manual）", () => {
    const item = makeSyncItem({
      resourceType: "certificate",
      syncState: "CONFLICT",
      conflict: { kind: "version_mismatch", detectedAt: 1000, description: "競合" },
    });
    expect(canAutoResolve(item)).toBe(false);
  });

  it("resource_deleted → false（常に manual）", () => {
    const item = makeSyncItem({
      syncState: "CONFLICT",
      conflict: { kind: "resource_deleted", detectedAt: 1000, description: "削除" },
    });
    expect(canAutoResolve(item)).toBe(false);
  });
});

// ── autoResolve ──

describe("autoResolve()", () => {
  it("自動解決可能なアイテム → PENDING + 解決レコード", () => {
    const item = makeSyncItem({
      resourceType: "reservation",
      syncState: "CONFLICT",
      conflict: { kind: "version_mismatch", detectedAt: 1000, description: "test" },
    });
    const result = autoResolve(item, 2000);
    expect(result.item).not.toBeNull();
    expect(result.item!.syncState).toBe("PENDING");
    expect(result.resolution).not.toBeNull();
    expect(result.resolution!.resolvedBy).toBe("auto");
    expect(result.resolution!.resolvedAt).toBe(2000);
  });

  it("手動解決が必要なアイテム → 変更なし", () => {
    const item = makeSyncItem({
      resourceType: "certificate",
      syncState: "CONFLICT",
      conflict: { kind: "version_mismatch", detectedAt: 1000, description: "test" },
    });
    const result = autoResolve(item, 2000);
    expect(result.item).toBe(item);
    expect(result.resolution).toBeNull();
  });
});

// ── autoResolveAll ──

describe("autoResolveAll()", () => {
  it("混在キューから自動解決可能なもののみ解決する", () => {
    const items: SyncQueueItem[] = [
      // 自動解決可能: duplicate_pending → retry
      makeSyncItem({
        outboxItemId: "a",
        syncState: "CONFLICT",
        conflict: { kind: "duplicate_pending", detectedAt: 1000, description: "重複" },
      }),
      // 手動解決必要: certificate + version_mismatch → manual
      makeSyncItem({
        outboxItemId: "b",
        resourceType: "certificate",
        syncState: "CONFLICT",
        conflict: { kind: "version_mismatch", detectedAt: 1000, description: "競合" },
      }),
      // 競合なし: そのまま
      makeSyncItem({ outboxItemId: "c", syncState: "PENDING" }),
    ];

    const result = autoResolveAll(items, 2000);
    expect(result.items).toHaveLength(3);
    expect(result.resolutions).toHaveLength(1);
    // a: PENDING に解決
    expect(result.items[0].syncState).toBe("PENDING");
    expect(result.items[0].conflict).toBeNull();
    // b: 変更なし
    expect(result.items[1].syncState).toBe("CONFLICT");
    // c: 変更なし
    expect(result.items[2].syncState).toBe("PENDING");
  });

  it("空配列 → 空結果", () => {
    const result = autoResolveAll([], 2000);
    expect(result.items).toEqual([]);
    expect(result.resolutions).toEqual([]);
  });
});
