import { describe, it, expect } from "vitest";
import { buildRetentionAuditEvents, countByTenant } from "../retentionAudit";

describe("retentionAudit [保持期限 cron のテナント別監査]", () => {
  it("テナントごとに数え、tenant_id の無い行は数えない", () => {
    expect(
      countByTenant([{ tenant_id: "a" }, { tenant_id: "a" }, { tenant_id: "b" }, { tenant_id: null }, {}]),
    ).toEqual({ a: 2, b: 1 });
  });

  it("テーブルをまたいでテナントごとに 1 行（テーブル別件数・合計つき）にまとめる", () => {
    const events = buildRetentionAuditEvents(
      [
        { table: "customer_login_codes", deleted: 3, byTenant: { a: 2, b: 1 } },
        { table: "notification_logs", deleted: 5, byTenant: { a: 5 } },
        { table: "stripe_processed_events", deleted: 7, byTenant: {} },
      ],
      "2026-10-06",
    );
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.tenantId === "a")).toMatchObject({
      action: "data_retention_pruned",
      actorType: "system",
      recordId: "data-retention:2026-10-06",
      extra: { breakdown: { customer_login_codes: 2, notification_logs: 5 }, total: 7 },
    });
    expect(events.find((e) => e.tenantId === "b")?.extra).toEqual({ breakdown: { customer_login_codes: 1 }, total: 1 });
  });

  it("消したものが無ければ監査イベントも作らない", () => {
    expect(buildRetentionAuditEvents([{ table: "x", deleted: 0, byTenant: {} }], "2026-10-06")).toEqual([]);
  });
});
