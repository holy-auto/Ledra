import { describe, it, expect } from "vitest";
import {
  DEFAULT_RESOLUTION_STRATEGY,
  recommendedStrategy,
  detectConflictFromResponse,
  detectDuplicatePending,
} from "../conflict";
import type { SyncResourceType, SyncQueueItem, SyncConflict, SyncSummary, ConflictResolution } from "../types";
import { SYNC_STATES } from "@/lib/domain/states";
import { SYNC_TRANSITIONS, isValidTransition } from "@/lib/domain/transitions";

// ── 型の構造テスト ──

describe("SyncResourceType", () => {
  it("8 種のリソースタイプが定義されている", () => {
    const types: SyncResourceType[] = [
      "certificate",
      "certificate_image",
      "reservation",
      "customer",
      "invoice",
      "vehicle",
      "part_installation",
      "work_step",
    ];
    expect(types).toHaveLength(8);
  });
});

describe("SyncQueueItem 型", () => {
  it("有効な SyncQueueItem オブジェクトが構築できる", () => {
    const item: SyncQueueItem = {
      outboxItemId: "abc-123",
      resourceType: "certificate",
      resourceId: "cert-001",
      syncState: "PENDING",
      tenantId: "tenant-1",
      createdAt: 1000,
      lastSyncAt: null,
      attempts: 0,
      lastError: null,
      conflict: null,
    };
    expect(item.syncState).toBe("PENDING");
    expect(item.conflict).toBeNull();
  });

  it("競合情報付きの SyncQueueItem が構築できる", () => {
    const conflict: SyncConflict = {
      kind: "version_mismatch",
      detectedAt: 2000,
      serverVersion: "v2",
      clientVersion: "v1",
      description: "サーバ側で変更が競合しています",
    };
    const item: SyncQueueItem = {
      outboxItemId: "abc-456",
      resourceType: "reservation",
      resourceId: "res-001",
      syncState: "CONFLICT",
      tenantId: "tenant-1",
      createdAt: 1000,
      lastSyncAt: 1500,
      attempts: 1,
      lastError: "HTTP 409",
      conflict,
    };
    expect(item.syncState).toBe("CONFLICT");
    expect(item.conflict?.kind).toBe("version_mismatch");
  });
});

describe("SyncSummary 型", () => {
  it("空のサマリーが構築できる", () => {
    const summary: SyncSummary = {
      total: 0,
      pending: 0,
      syncing: 0,
      failed: 0,
      conflicted: 0,
      oldestPendingSince: null,
    };
    expect(summary.total).toBe(0);
  });
});

describe("ConflictResolution 型", () => {
  it("解決結果が構築できる", () => {
    const resolution: ConflictResolution = {
      conflict: {
        kind: "version_mismatch",
        detectedAt: 1000,
        description: "テスト",
      },
      strategy: "client_wins",
      resolvedAt: 2000,
      resolvedBy: "user",
    };
    expect(resolution.strategy).toBe("client_wins");
  });
});

// ── SyncState × 遷移表との整合性 ──

describe("SyncState と同期キューの整合性", () => {
  it("SyncQueueItem.syncState は SyncState の有効な値のみ受け入れる", () => {
    for (const state of SYNC_STATES) {
      const item: SyncQueueItem = {
        outboxItemId: "test",
        resourceType: "certificate",
        resourceId: "test",
        syncState: state,
        tenantId: "t",
        createdAt: 0,
        lastSyncAt: null,
        attempts: 0,
        lastError: null,
        conflict: null,
      };
      expect(SYNC_STATES).toContain(item.syncState);
    }
  });

  it("SYNCED → PENDING（変更検知）は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "SYNCED", "PENDING")).toBe(true);
  });

  it("SYNCING → CONFLICT（競合検出）は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "SYNCING", "CONFLICT")).toBe(true);
  });

  it("CONFLICT → PENDING（解決後の再同期）は有効", () => {
    expect(isValidTransition(SYNC_TRANSITIONS, "CONFLICT", "PENDING")).toBe(true);
  });
});

// ── デフォルト解決戦略 ──

describe("DEFAULT_RESOLUTION_STRATEGY", () => {
  it("全 SyncResourceType にエントリがある", () => {
    const resourceTypes: SyncResourceType[] = [
      "certificate",
      "certificate_image",
      "reservation",
      "customer",
      "invoice",
      "vehicle",
      "part_installation",
      "work_step",
    ];
    for (const rt of resourceTypes) {
      expect(DEFAULT_RESOLUTION_STRATEGY).toHaveProperty(rt);
    }
  });

  it("証明書・部品装着は manual（証跡整合性が最重要）", () => {
    expect(DEFAULT_RESOLUTION_STRATEGY.certificate).toBe("manual");
    expect(DEFAULT_RESOLUTION_STRATEGY.certificate_image).toBe("manual");
    expect(DEFAULT_RESOLUTION_STRATEGY.part_installation).toBe("manual");
  });

  it("予約・顧客・車両は client_wins（可逆な変更）", () => {
    expect(DEFAULT_RESOLUTION_STRATEGY.reservation).toBe("client_wins");
    expect(DEFAULT_RESOLUTION_STRATEGY.customer).toBe("client_wins");
    expect(DEFAULT_RESOLUTION_STRATEGY.vehicle).toBe("client_wins");
  });

  it("請求書は manual（金額変更は要確認）", () => {
    expect(DEFAULT_RESOLUTION_STRATEGY.invoice).toBe("manual");
  });
});

// ── recommendedStrategy ──

describe("recommendedStrategy()", () => {
  it("resource_deleted は常に manual", () => {
    expect(recommendedStrategy("resource_deleted", "reservation")).toBe("manual");
    expect(recommendedStrategy("resource_deleted", "certificate")).toBe("manual");
  });

  it("duplicate_pending は常に retry", () => {
    expect(recommendedStrategy("duplicate_pending", "reservation")).toBe("retry");
    expect(recommendedStrategy("duplicate_pending", "certificate")).toBe("retry");
  });

  it("version_mismatch はリソースタイプのデフォルトに従う", () => {
    expect(recommendedStrategy("version_mismatch", "reservation")).toBe("client_wins");
    expect(recommendedStrategy("version_mismatch", "certificate")).toBe("manual");
  });
});

// ── detectConflictFromResponse ──

describe("detectConflictFromResponse()", () => {
  it("409 + PUT → version_mismatch", () => {
    const conflict = detectConflictFromResponse(409, "PUT");
    expect(conflict).not.toBeNull();
    expect(conflict!.kind).toBe("version_mismatch");
  });

  it("409 + PATCH → version_mismatch", () => {
    const conflict = detectConflictFromResponse(409, "PATCH");
    expect(conflict).not.toBeNull();
    expect(conflict!.kind).toBe("version_mismatch");
  });

  it("409 + POST → null（冪等性衝突は競合ではない）", () => {
    expect(detectConflictFromResponse(409, "POST")).toBeNull();
  });

  it("404 + PUT → resource_deleted", () => {
    const conflict = detectConflictFromResponse(404, "PUT");
    expect(conflict).not.toBeNull();
    expect(conflict!.kind).toBe("resource_deleted");
  });

  it("410 + PATCH → resource_deleted", () => {
    const conflict = detectConflictFromResponse(410, "PATCH");
    expect(conflict).not.toBeNull();
    expect(conflict!.kind).toBe("resource_deleted");
  });

  it("404 + POST → null（新規作成の 404 は競合ではない）", () => {
    expect(detectConflictFromResponse(404, "POST")).toBeNull();
  });

  it("200 → null", () => {
    expect(detectConflictFromResponse(200, "PUT")).toBeNull();
  });

  it("500 → null（サーバエラーは競合ではない）", () => {
    expect(detectConflictFromResponse(500, "PUT")).toBeNull();
  });

  it("カスタムメッセージが description に反映される", () => {
    const conflict = detectConflictFromResponse(409, "PUT", "Version conflict on cert-001");
    expect(conflict!.description).toBe("Version conflict on cert-001");
  });
});

// ── detectDuplicatePending ──

describe("detectDuplicatePending()", () => {
  it("重複なし → 空マップ", () => {
    const items = [
      { resourceType: "certificate", resourceId: "c1" },
      { resourceType: "reservation", resourceId: "r1" },
    ];
    expect(detectDuplicatePending(items).size).toBe(0);
  });

  it("同一リソースが 2 件 → duplicate_pending", () => {
    const items = [
      { resourceType: "certificate", resourceId: "c1" },
      { resourceType: "certificate", resourceId: "c1" },
    ];
    const conflicts = detectDuplicatePending(items);
    expect(conflicts.size).toBe(1);
    expect(conflicts.get("certificate:c1")!.kind).toBe("duplicate_pending");
  });

  it("同一 resourceId でも resourceType が異なれば重複ではない", () => {
    const items = [
      { resourceType: "certificate", resourceId: "x1" },
      { resourceType: "reservation", resourceId: "x1" },
    ];
    expect(detectDuplicatePending(items).size).toBe(0);
  });

  it("3 件の重複 → description に件数が含まれる", () => {
    const items = [
      { resourceType: "reservation", resourceId: "r1" },
      { resourceType: "reservation", resourceId: "r1" },
      { resourceType: "reservation", resourceId: "r1" },
    ];
    const conflicts = detectDuplicatePending(items);
    expect(conflicts.get("reservation:r1")!.description).toContain("3");
  });

  it("空配列 → 空マップ", () => {
    expect(detectDuplicatePending([]).size).toBe(0);
  });
});
