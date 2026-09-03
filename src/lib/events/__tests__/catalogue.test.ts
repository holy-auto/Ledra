import { describe, it, expect } from "vitest";
import { eventRisk } from "../domainEvent";
import {
  DOMAIN_EVENT_TYPES,
  isDomainEventType,
  eventTypesForResource,
  LEGACY_EVENT_MAP,
  fromLegacyEventType,
} from "../catalogue";

describe("DOMAIN_EVENT_TYPES", () => {
  it("has no duplicates", () => {
    expect(new Set(DOMAIN_EVENT_TYPES).size).toBe(DOMAIN_EVENT_TYPES.length);
  });

  it("all follow resource.action naming", () => {
    for (const t of DOMAIN_EVENT_TYPES) {
      expect(t).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("covers at least 26 event types", () => {
    // 23 AuditEventType + 1 ai_auto_action_executed + 2 untyped + extras
    expect(DOMAIN_EVENT_TYPES.length).toBeGreaterThanOrEqual(26);
  });
});

describe("isDomainEventType()", () => {
  it("returns true for valid types", () => {
    expect(isDomainEventType("certificate.issued")).toBe(true);
    expect(isDomainEventType("ai.auto_action_executed")).toBe(true);
    expect(isDomainEventType("note.created")).toBe(true);
  });

  it("returns false for invalid types", () => {
    expect(isDomainEventType("unknown.event")).toBe(false);
    expect(isDomainEventType("certificate_issued")).toBe(false); // legacy format
    expect(isDomainEventType(42)).toBe(false);
    expect(isDomainEventType(null)).toBe(false);
  });
});

describe("eventTypesForResource()", () => {
  it("returns certificate events", () => {
    const certs = eventTypesForResource("certificate");
    expect(certs).toContain("certificate.issued");
    expect(certs).toContain("certificate.voided");
    expect(certs.length).toBe(8);
  });

  it("returns empty for unknown resource", () => {
    expect(eventTypesForResource("nonexistent")).toEqual([]);
  });

  it("returns ai events", () => {
    const ai = eventTypesForResource("ai");
    expect(ai.length).toBe(5);
    expect(ai).toContain("ai.auto_action_executed");
  });

  it("returns sync events (IMP-016)", () => {
    const sync = eventTypesForResource("sync");
    expect(sync.length).toBe(5);
    expect(sync).toContain("sync.started");
    expect(sync).toContain("sync.completed");
    expect(sync).toContain("sync.failed");
    expect(sync).toContain("sync.conflict_detected");
    expect(sync).toContain("sync.conflict_resolved");
  });
});

describe("LEGACY_EVENT_MAP", () => {
  it("maps all 23 AuditEventType values", () => {
    // 8 cert + 15 general from AuditEventType
    const auditTypes = [
      "certificate_issued",
      "certificate_edited",
      "certificate_voided",
      "certificate_viewed",
      "certificate_pdf_generated",
      "certificate_pdf_batch",
      "certificate_public_viewed",
      "certificate_public_pdf",
      "vehicle_registered",
      "vehicle_updated",
      "member_added",
      "member_removed",
      "member_role_changed",
      "reservation_created",
      "reservation_completed",
      "reservation_cancelled",
      "invoice_created",
      "invoice_paid",
      "ai_settings_changed",
      "ai_suggestion_generated",
      "ai_suggestion_applied",
      "ai_suggestion_rejected",
      "note",
    ];
    for (const t of auditTypes) {
      expect(LEGACY_EVENT_MAP[t]).toBeDefined();
      expect(isDomainEventType(LEGACY_EVENT_MAP[t])).toBe(true);
    }
  });

  it("maps untyped events", () => {
    expect(LEGACY_EVENT_MAP["progress_update"]).toBe("progress.updated");
    expect(LEGACY_EVENT_MAP["thickness_measurement"]).toBe("thickness.measured");
  });

  it("maps ai_auto_action_executed", () => {
    expect(LEGACY_EVENT_MAP["ai_auto_action_executed"]).toBe("ai.auto_action_executed");
  });

  it("all mapped values are valid DomainEventType", () => {
    for (const v of Object.values(LEGACY_EVENT_MAP)) {
      expect(isDomainEventType(v)).toBe(true);
    }
  });
});

describe("fromLegacyEventType()", () => {
  it("converts known legacy type", () => {
    expect(fromLegacyEventType("certificate_issued")).toBe("certificate.issued");
    expect(fromLegacyEventType("note")).toBe("note.created");
  });

  it("returns null for unknown", () => {
    expect(fromLegacyEventType("unknown_type")).toBeNull();
  });
});

// リスクは `?? "low"` に落ちるので、登録し忘れが静かに起きる。
describe("eventRisk() — sync イベント", () => {
  it("競合と失敗は low のままにしない", () => {
    // 未登録だと証明書の競合が進捗メモ（medium）より下に格付けされる。
    expect(eventRisk("sync.conflict_detected")).not.toBe("low");
    expect(eventRisk("sync.conflict_resolved")).not.toBe("low");
    expect(eventRisk("sync.failed")).not.toBe("low");
  });
});

describe("fromLegacyEventType() — 表に無い値", () => {
  it("Object.prototype 由来のキーで関数を返さない", () => {
    for (const k of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(fromLegacyEventType(k)).toBeNull();
    }
  });
});

describe("稼働中の webhook 名がカタログにあること", () => {
  it("vehicle.created が表せる", () => {
    // webhook-topics.ts と api/vehicles/create/route.ts:60 が実際に投げている名前。
    expect(isDomainEventType("vehicle.created")).toBe(true);
  });

  it("vehicle.created と vehicle.registered が同じ格付けになる", () => {
    // 同義なのに片方だけ登録すると、同じ操作が別のリスクで扱われる。
    expect(eventRisk("vehicle.created")).toBe(eventRisk("vehicle.registered"));
    expect(eventRisk("vehicle.created")).not.toBe("low");
  });
});
