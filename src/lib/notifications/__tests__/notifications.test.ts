import { describe, it, expect } from "vitest";

// ── types ──
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_CATALOG,
  isActionRequired,
  isNotificationType,
  getTypeConfig,
} from "../types";
import type { NotificationTypeConfig } from "../types";

// ── deepLink ──
import { buildDeepLink, buildCertificatePublicLink } from "../deepLink";
import type { DeepLinkEntity } from "../deepLink";

// ── escalation ──
import { DEFAULT_SLA_THRESHOLDS, AT_RISK_RATIO, evaluateEscalation, shouldEscalate } from "../escalation";

// ── routing ──
import { resolveChannels, countActionRequired, groupByCategory, filterBySeverity } from "../routing";

// ============================================================
// types.ts
// ============================================================

describe("types", () => {
  it("全カタログエントリに必須フィールドがある", () => {
    const entries = Object.values(NOTIFICATION_TYPE_CATALOG) as NotificationTypeConfig[];
    expect(entries.length).toBeGreaterThanOrEqual(18);
    for (const config of entries) {
      expect(NOTIFICATION_SEVERITIES).toContain(config.severity);
      expect(config.defaultChannels.length).toBeGreaterThan(0);
      for (const ch of config.defaultChannels) {
        expect(NOTIFICATION_CHANNELS).toContain(ch);
      }
      expect(NOTIFICATION_CATEGORIES).toContain(config.category);
      if (config.targetRole !== undefined) {
        expect(["owner", "admin", "staff", "assigned", "customer"]).toContain(config.targetRole);
      }
    }
  });

  it("isActionRequired: urgent/action_required は true、informational は false", () => {
    expect(isActionRequired("urgent")).toBe(true);
    expect(isActionRequired("action_required")).toBe(true);
    expect(isActionRequired("informational")).toBe(false);
  });

  it("isNotificationType: カタログに存在するタイプは true", () => {
    expect(isNotificationType("booking_created")).toBe(true);
    expect(isNotificationType("sla_overdue")).toBe(true);
    expect(isNotificationType("nonexistent_type")).toBe(false);
    expect(isNotificationType(42)).toBe(false);
    expect(isNotificationType(null)).toBe(false);
  });

  it("getTypeConfig: 既知タイプは正しい設定を返す", () => {
    const config = getTypeConfig("sla_overdue");
    expect(config.severity).toBe("urgent");
    expect(config.category).toBe("sla");
  });

  it("getTypeConfig: 未知タイプは informational/in_app/system を返す", () => {
    const config = getTypeConfig("unknown_future_type");
    expect(config.severity).toBe("informational");
    expect(config.defaultChannels).toEqual(["in_app"]);
    expect(config.category).toBe("system");
  });
});

// ============================================================
// deepLink.ts
// ============================================================

describe("deepLink", () => {
  const BASE = "https://app.ledra.co.jp";

  it("admin ロールの job リンクを生成", () => {
    const result = buildDeepLink(BASE, {
      entity: "job",
      id: "abc-123",
      role: "admin",
    });
    expect(result.path).toBe("/admin/jobs/abc-123");
    expect(result.url).toBe("https://app.ledra.co.jp/admin/jobs/abc-123");
  });

  it("admin ロールの各エンティティのパスが正しい", () => {
    const cases: [string, string][] = [
      ["order", "/admin/orders/id1"],
      ["certificate", "/admin/certificates/id1"],
      ["customer", "/admin/customers/id1"],
      ["vehicle", "/admin/vehicles/id1"],
      ["document", "/admin/documents/id1"],
      ["invoice", "/admin/invoices/id1"],
      ["thickness_report", "/admin/thickness-reports/id1"],
    ];
    for (const [entity, expected] of cases) {
      const result = buildDeepLink(BASE, {
        entity: entity as DeepLinkEntity,
        id: "id1",
        role: "admin",
      });
      expect(result.path).toBe(expected);
    }
  });

  it("admin の reservation はリスト画面へリンク", () => {
    const result = buildDeepLink(BASE, {
      entity: "reservation",
      id: "any",
      role: "admin",
    });
    expect(result.path).toBe("/admin/reservations");
  });

  it("insurer ロールの insurer_case リンクを生成", () => {
    const result = buildDeepLink(BASE, {
      entity: "insurer_case",
      id: "case-456",
      role: "insurer",
    });
    expect(result.path).toBe("/insurer/cases/case-456");
    expect(result.url).toBe("https://app.ledra.co.jp/insurer/cases/case-456");
  });

  it("insurer ロールで insurer_case 以外は null", () => {
    const result = buildDeepLink(BASE, {
      entity: "job",
      id: "x",
      role: "insurer",
    });
    expect(result.path).toBeNull();
    expect(result.url).toBeNull();
  });

  it("customer ロールは tenantSlug 付きでポータルリンク", () => {
    const result = buildDeepLink(BASE, {
      entity: "job",
      id: "x",
      role: "customer",
      tenantSlug: "holy-auto",
    });
    expect(result.path).toBe("/customer/holy-auto");
    expect(result.url).toBe("https://app.ledra.co.jp/customer/holy-auto");
  });

  it("customer ロールで tenantSlug なしは null", () => {
    const result = buildDeepLink(BASE, {
      entity: "job",
      id: "x",
      role: "customer",
    });
    expect(result.path).toBeNull();
  });

  it("baseUrl の末尾スラッシュを除去する", () => {
    const result = buildDeepLink("https://app.ledra.co.jp/", {
      entity: "job",
      id: "1",
      role: "admin",
    });
    expect(result.url).toBe("https://app.ledra.co.jp/admin/jobs/1");
  });

  it("buildCertificatePublicLink", () => {
    const url = buildCertificatePublicLink(BASE, "pub-id-789");
    expect(url).toBe("https://app.ledra.co.jp/c/pub-id-789");
  });
});

// ============================================================
// escalation.ts
// ============================================================

describe("escalation", () => {
  const thresholds = { ...DEFAULT_SLA_THRESHOLDS };

  /** ヘルパー: 指定時間前の createdAtMs を生成 */
  function hoursAgo(hours: number, now: number): number {
    return now - hours * 60 * 60 * 1000;
  }

  it("期限内は stage=null", () => {
    const now = Date.now();
    // normal=72h、10時間経過 → 残り62時間（86% 残）
    const result = evaluateEscalation(hoursAgo(10, now), "normal", thresholds, now);
    expect(result.stage).toBeNull();
    expect(result.remainingHours).toBeCloseTo(62, 0);
    expect(result.elapsedHours).toBeCloseTo(10, 0);
  });

  it("残り25%以下で at_risk", () => {
    const now = Date.now();
    // normal=72h、56時間経過 → 残り16時間（22.2%）
    const result = evaluateEscalation(hoursAgo(56, now), "normal", thresholds, now);
    expect(result.stage).toBe("at_risk");
    expect(result.remainingHours).toBeCloseTo(16, 0);
    expect(result.remainingRatio).toBeLessThanOrEqual(AT_RISK_RATIO);
  });

  it("未知の priority(Object.prototype のプロパティ名含む)は normal にフォールバック", () => {
    const now = Date.now();
    // "constructor" は thresholds に own property として存在しないため normal(72h) を使うべき。
    // ブラケットアクセスだけだと Object.prototype.constructor を拾ってしまう回帰を防ぐ。
    const result = evaluateEscalation(hoursAgo(10, now), "constructor", thresholds, now);
    expect(result.thresholdHours).toBe(thresholds.normal);
    expect(result.remainingHours).toBeCloseTo(62, 0);
  });

  it("残り0以下で overdue", () => {
    const now = Date.now();
    // urgent=4h、5時間経過 → 残り-1時間
    const result = evaluateEscalation(hoursAgo(5, now), "urgent", thresholds, now);
    expect(result.stage).toBe("overdue");
    expect(result.remainingHours).toBeCloseTo(-1, 0);
  });

  it("未知の priority は normal にフォールバック", () => {
    const now = Date.now();
    const result = evaluateEscalation(hoursAgo(10, now), "unknown", thresholds, now);
    expect(result.thresholdHours).toBe(thresholds.normal);
  });

  describe("shouldEscalate", () => {
    it("null → at_risk: true", () => {
      expect(shouldEscalate("at_risk", null)).toBe(true);
    });
    it("null → overdue: true", () => {
      expect(shouldEscalate("overdue", null)).toBe(true);
    });
    it("at_risk → overdue: true（エスカレーション）", () => {
      expect(shouldEscalate("overdue", "at_risk")).toBe(true);
    });
    it("at_risk → at_risk: false（重複抑止）", () => {
      expect(shouldEscalate("at_risk", "at_risk")).toBe(false);
    });
    it("overdue → overdue: false（重複抑止）", () => {
      expect(shouldEscalate("overdue", "overdue")).toBe(false);
    });
    it("overdue → at_risk: false（逆行しない）", () => {
      expect(shouldEscalate("at_risk", "overdue")).toBe(false);
    });
  });
});

// ============================================================
// routing.ts
// ============================================================

describe("routing", () => {
  describe("resolveChannels", () => {
    it("デフォルトチャネルをそのまま返す", () => {
      const channels = resolveChannels("booking_created");
      expect(channels).toEqual(["in_app", "email", "slack"]);
    });

    it("disabledChannels で除外できる", () => {
      const channels = resolveChannels("booking_created", {
        disabledChannels: ["slack"],
      });
      expect(channels).toEqual(["in_app", "email"]);
    });

    it("additionalChannels で追加できる", () => {
      const channels = resolveChannels("order_created", {
        additionalChannels: ["push"],
      });
      expect(channels).toContain("in_app");
      expect(channels).toContain("push");
    });

    it("disabled は additional にも適用される", () => {
      const channels = resolveChannels("order_created", {
        disabledChannels: ["in_app"],
        additionalChannels: ["in_app", "push"],
      });
      expect(channels).not.toContain("in_app");
      expect(channels).toContain("push");
    });

    it("未知タイプは in_app のみ", () => {
      const channels = resolveChannels("unknown_type");
      expect(channels).toEqual(["in_app"]);
    });
  });

  describe("countActionRequired", () => {
    it("urgent と action_required の未読のみカウント", () => {
      const notifications = [
        { type: "sla_overdue", read: false }, // urgent → count
        { type: "order_created", read: false }, // action_required → count
        { type: "order_completed", read: false }, // informational → skip
        { type: "sla_at_risk", read: true }, // read → skip
      ];
      expect(countActionRequired(notifications)).toBe(2);
    });

    it("空配列は 0", () => {
      expect(countActionRequired([])).toBe(0);
    });
  });

  describe("groupByCategory", () => {
    it("カテゴリごとにグルーピングする", () => {
      const notifications = [
        { type: "order_created", id: "1" },
        { type: "order_completed", id: "2" },
        { type: "sla_overdue", id: "3" },
        { type: "booking_created", id: "4" },
      ];
      const groups = groupByCategory(notifications);
      expect(groups.job).toHaveLength(2);
      expect(groups.sla).toHaveLength(1);
      expect(groups.booking).toHaveLength(1);
      expect(groups.payment).toBeUndefined();
    });
  });

  describe("filterBySeverity", () => {
    const notifications = [
      { type: "sla_overdue" }, // urgent
      { type: "order_created" }, // action_required
      { type: "order_completed" }, // informational
    ];

    it("urgent のみフィルタ", () => {
      const result = filterBySeverity(notifications, "urgent");
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("sla_overdue");
    });

    it("action_required 以上をフィルタ", () => {
      const result = filterBySeverity(notifications, "action_required");
      expect(result).toHaveLength(2);
    });

    it("informational は全件", () => {
      const result = filterBySeverity(notifications, "informational");
      expect(result).toHaveLength(3);
    });
  });
});
