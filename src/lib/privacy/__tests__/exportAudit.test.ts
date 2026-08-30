import { describe, it, expect } from "vitest";
import {
  EXPORT_SCOPES,
  EXPORT_PERMISSION_VERB,
  createExportAuditEntry,
  detectAbnormalExportFrequency,
} from "../exportAudit";

describe("EXPORT_SCOPES", () => {
  it("4 スコープが定義されている", () => {
    expect(EXPORT_SCOPES).toEqual(["admin", "customer", "agent", "insurer"]);
  });
});

describe("EXPORT_PERMISSION_VERB", () => {
  it("data:export", () => {
    expect(EXPORT_PERMISSION_VERB).toBe("data:export");
  });
});

describe("createExportAuditEntry", () => {
  it("必須フィールドから正規化されたイベントを生成", () => {
    const entry = createExportAuditEntry({
      scope: "admin",
      actorId: "user_123",
      scopeId: "tenant_abc",
      tablesIncluded: ["vehicles", "certificates"],
      exportedAt: "2024-01-15T10:00:00Z",
    });

    expect(entry.type).toBe("data_export");
    expect(entry.scope).toBe("admin");
    expect(entry.actorId).toBe("user_123");
    expect(entry.scopeId).toBe("tenant_abc");
    expect(entry.tablesIncluded).toEqual(["vehicles", "certificates"]);
    expect(entry.format).toBe("json");
    expect(entry.schemaVersion).toBe("1.0");
    expect(entry.requestIp).toBeUndefined();
  });

  it("オプションフィールドを含む", () => {
    const entry = createExportAuditEntry({
      scope: "customer",
      actorId: "cust_456",
      scopeId: "tenant_abc",
      tablesIncluded: ["vehicles"],
      rowCounts: { vehicles: 42 },
      exportedAt: "2024-01-15T10:00:00Z",
      schemaVersion: "2.0",
      requestIp: "192.168.1.1",
    });

    expect(entry.rowCounts).toEqual({ vehicles: 42 });
    expect(entry.schemaVersion).toBe("2.0");
    expect(entry.requestIp).toBe("192.168.1.1");
  });

  it("呼び出し側の配列/オブジェクトを後から変更しても監査エントリは変わらない（参照ではなくコピー）", () => {
    const tablesIncluded = ["vehicles"];
    const rowCounts = { vehicles: 1 };
    const entry = createExportAuditEntry({
      scope: "admin",
      actorId: "user_123",
      scopeId: "tenant_abc",
      tablesIncluded,
      rowCounts,
      exportedAt: "2024-01-15T10:00:00Z",
    });

    tablesIncluded.push("certificates");
    rowCounts.vehicles = 999;

    expect(entry.tablesIncluded).toEqual(["vehicles"]);
    expect(entry.rowCounts).toEqual({ vehicles: 1 });
  });
});

describe("detectAbnormalExportFrequency", () => {
  const ref = "2024-01-15T10:00:00Z";

  it("閾値以下 → 正常", () => {
    const exports = [{ exportedAt: "2024-01-15T09:30:00Z" }, { exportedAt: "2024-01-15T09:45:00Z" }];
    const result = detectAbnormalExportFrequency(exports, ref);
    expect(result.isAbnormal).toBe(false);
    expect(result.countInWindow).toBe(2);
  });

  it("閾値超過 → 異常", () => {
    const exports = [
      { exportedAt: "2024-01-15T09:10:00Z" },
      { exportedAt: "2024-01-15T09:20:00Z" },
      { exportedAt: "2024-01-15T09:30:00Z" },
      { exportedAt: "2024-01-15T09:50:00Z" },
    ];
    const result = detectAbnormalExportFrequency(exports, ref);
    expect(result.isAbnormal).toBe(true);
    expect(result.countInWindow).toBe(4);
  });

  it("ウィンドウ外のエクスポートはカウントしない", () => {
    const exports = [
      { exportedAt: "2024-01-15T08:00:00Z" }, // > 1h ago
      { exportedAt: "2024-01-15T09:30:00Z" }, // within 1h
    ];
    const result = detectAbnormalExportFrequency(exports, ref);
    expect(result.countInWindow).toBe(1);
    expect(result.isAbnormal).toBe(false);
  });

  it("空配列 → 正常", () => {
    const result = detectAbnormalExportFrequency([], ref);
    expect(result.isAbnormal).toBe(false);
    expect(result.countInWindow).toBe(0);
  });

  it("カスタム maxPerHour", () => {
    const exports = [{ exportedAt: "2024-01-15T09:30:00Z" }, { exportedAt: "2024-01-15T09:45:00Z" }];
    const result = detectAbnormalExportFrequency(exports, ref, 1);
    expect(result.isAbnormal).toBe(true);
    expect(result.countInWindow).toBe(2);
  });

  it("ちょうど閾値 → 正常（超過で異常）", () => {
    const exports = [
      { exportedAt: "2024-01-15T09:10:00Z" },
      { exportedAt: "2024-01-15T09:30:00Z" },
      { exportedAt: "2024-01-15T09:50:00Z" },
    ];
    const result = detectAbnormalExportFrequency(exports, ref, 3);
    expect(result.isAbnormal).toBe(false);
    expect(result.countInWindow).toBe(3);
  });
});
