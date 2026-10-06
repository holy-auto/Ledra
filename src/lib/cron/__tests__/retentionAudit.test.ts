import { describe, it, expect } from "vitest";
import { buildRetentionAuditEvents, countByTenant } from "../retentionAudit";

describe("retentionAudit [保持期限 cron のテナント別監査]", () => {
  it("テナントごとに数え、tenant_id の無い行は数えない", () => {
    expect(
      countByTenant([{ tenant_id: "a" }, { tenant_id: "a" }, { tenant_id: "b" }, { tenant_id: null }, {}]),
    ).toEqual({ a: 2, b: 1 });
  });

  it("テナントごとに 1 行、削除と秘匿化を分け、テナント無しの行は tenant_id=null の 1 行にまとめる", () => {
    const events = buildRetentionAuditEvents(
      [
        { table: "customer_login_codes", kind: "deleted", count: 3, byTenant: { a: 2, b: 1 } },
        { table: "notification_logs", kind: "deleted", count: 5, byTenant: { a: 5 } },
        { table: "reservations", kind: "redacted", count: 4, byTenant: { a: 4 } },
        { table: "stripe_processed_events", kind: "deleted", count: 7, byTenant: {} },
      ],
      "2026-10-06",
    );
    expect(events).toHaveLength(3);
    expect(events.find((e) => e.tenantId === "a")).toMatchObject({
      action: "data_retention_pruned",
      actorType: "system",
      recordId: "data-retention:2026-10-06",
      extra: {
        deleted: { customer_login_codes: 2, notification_logs: 5 },
        redacted: { reservations: 4 },
        total_deleted: 7,
        total_redacted: 4,
      },
    });
    expect(events.find((e) => e.tenantId === "b")?.extra).toEqual({
      deleted: { customer_login_codes: 1 },
      redacted: {},
      total_deleted: 1,
      total_redacted: 0,
    });
    expect(events.find((e) => e.tenantId === null)?.extra).toEqual({
      deleted: { stripe_processed_events: 7 },
      redacted: {},
      total_deleted: 7,
      total_redacted: 0,
    });
  });

  it("処理したものが無ければ監査イベントも作らない", () => {
    expect(buildRetentionAuditEvents([{ table: "x", kind: "deleted", count: 0, byTenant: {} }], "2026-10-06")).toEqual(
      [],
    );
  });
});
