import { describe, expect, it } from "vitest";
import {
  normalizeNotifType,
  summarizeNotifications,
  labelForType,
  type NotifLogRow,
} from "@/lib/admin/notificationSummary";

describe("normalizeNotifType", () => {
  it("strips day/month/year suffixes to a base category", () => {
    expect(normalizeNotifType("expiry_reminder_60d")).toBe("expiry_reminder");
    expect(normalizeNotifType("follow_up_90d")).toBe("follow_up");
    expect(normalizeNotifType("maintenance_reminder_6m")).toBe("maintenance_reminder");
    expect(normalizeNotifType("birthday_2026")).toBe("birthday");
    expect(normalizeNotifType("service_reminder")).toBe("service_reminder");
  });
});

describe("labelForType", () => {
  it("maps known types and falls back to raw", () => {
    expect(labelForType("inspection_reminder")).toBe("車検満了");
    expect(labelForType("unknown_thing")).toBe("unknown_thing");
  });
});

describe("summarizeNotifications", () => {
  const rows: NotifLogRow[] = [
    { type: "service_reminder", status: "sent", channel: "line" },
    { type: "service_reminder", status: "failed", channel: "email" },
    { type: "expiry_reminder_60d", status: "sent", channel: "email" },
    { type: "expiry_reminder_30d", status: "sent", channel: "line" },
    { type: "birthday_2026", status: "sent", channel: "line" },
  ];

  it("aggregates by normalized type with channel + failure rate", () => {
    const s = summarizeNotifications(rows);
    const svc = s.by_type.find((t) => t.type === "service_reminder")!;
    expect(svc.sent).toBe(1);
    expect(svc.failed).toBe(1);
    expect(svc.total).toBe(2);
    expect(svc.failure_rate).toBe(0.5);
    expect(svc.line).toBe(1);
    expect(svc.email).toBe(1);

    const exp = s.by_type.find((t) => t.type === "expiry_reminder")!;
    expect(exp.total).toBe(2); // _60d + _30d merged
    expect(exp.sent).toBe(2);
  });

  it("computes overall totals", () => {
    const s = summarizeNotifications(rows);
    expect(s.totals.total).toBe(5);
    expect(s.totals.sent).toBe(4);
    expect(s.totals.failed).toBe(1);
    expect(s.totals.failure_rate).toBeCloseTo(0.2);
  });

  it("flags known reminder types with zero events as silent (labelled)", () => {
    const s = summarizeNotifications(rows);
    // inspection_reminder / warranty_end_reminder / maintenance_reminder / follow_up は 0 件
    expect(s.silent_types).toContain("車検満了");
    expect(s.silent_types).toContain("保証満了");
    expect(s.silent_types).toContain("施工後フォロー");
    // 出ているものは silent に入らない
    expect(s.silent_types).not.toContain("定期点検・交換");
    expect(s.silent_types).not.toContain("誕生日");
  });

  it("returns zeroed totals for empty input", () => {
    const s = summarizeNotifications([]);
    expect(s.totals).toEqual({ sent: 0, failed: 0, total: 0, failure_rate: 0 });
    expect(s.by_type).toEqual([]);
  });
});
