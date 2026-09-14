import { describe, it, expect } from "vitest";
import { PRIORITY_TRIGGERS, isPriorityAffecting, getPriorityTrigger, toPriorityRecalcRequest } from "../eventTriggers";
import { isDomainEventType } from "@/lib/events/catalogue";
import { createDomainEvent } from "@/lib/events/domainEvent";

// ── PRIORITY_TRIGGERS ──

describe("PRIORITY_TRIGGERS", () => {
  it("全エントリの eventType が有効な DomainEventType", () => {
    for (const t of PRIORITY_TRIGGERS) {
      expect(isDomainEventType(t.eventType), `${t.eventType} は有効な DomainEventType であるべき`).toBe(true);
    }
  });

  it("全エントリに affectedSources と description がある", () => {
    for (const t of PRIORITY_TRIGGERS) {
      expect(t.affectedSources.length).toBeGreaterThan(0);
      expect(t.description).toBeTruthy();
    }
  });

  it("重複する eventType がない", () => {
    const types = PRIORITY_TRIGGERS.map((t) => t.eventType);
    expect(new Set(types).size).toBe(types.length);
  });
});

// ── isPriorityAffecting ──

describe("isPriorityAffecting", () => {
  it("登録済みイベントは true", () => {
    expect(isPriorityAffecting("reservation.created")).toBe(true);
    expect(isPriorityAffecting("invoice.paid")).toBe(true);
    expect(isPriorityAffecting("certificate.issued")).toBe(true);
  });

  it("閲覧系イベントは false（優先度に無関係）", () => {
    expect(isPriorityAffecting("certificate.viewed")).toBe(false);
    expect(isPriorityAffecting("certificate.pdf_generated")).toBe(false);
    expect(isPriorityAffecting("certificate.public_viewed")).toBe(false);
  });
});

// ── getPriorityTrigger ──

describe("getPriorityTrigger", () => {
  it("登録済み → PriorityTrigger を返す", () => {
    const trigger = getPriorityTrigger("reservation.completed");
    expect(trigger).not.toBeNull();
    expect(trigger!.effect).toBe("update_signal");
    expect(trigger!.affectedSources).toContain("dashboard");
    expect(trigger!.affectedSources).toContain("booth");
  });

  it("未登録 → null", () => {
    expect(getPriorityTrigger("note.created")).toBeNull();
  });
});

// ── toPriorityRecalcRequest ──

describe("toPriorityRecalcRequest", () => {
  it("優先度影響イベント → PriorityRecalcRequest を生成", () => {
    const event = createDomainEvent({
      type: "invoice.paid",
      tenantId: "t1",
      actor: { kind: "user", userId: "u1" },
      risk: "high",
      payload: { invoiceId: "inv-1" },
      subject: { kind: "invoice", id: "inv-1" },
    });

    const req = toPriorityRecalcRequest(event);
    expect(req).not.toBeNull();
    expect(req!.eventType).toBe("invoice.paid");
    expect(req!.tenantId).toBe("t1");
    expect(req!.entityId).toBe("inv-1");
    expect(req!.targetSources).toContain("dashboard");
    expect(req!.triggeredAt).toBeTruthy();
  });

  it("優先度無関係イベント → null", () => {
    const event = createDomainEvent({
      type: "certificate.viewed",
      tenantId: "t1",
      actor: { kind: "user", userId: "u1" },
      risk: "low",
      payload: {},
    });

    expect(toPriorityRecalcRequest(event)).toBeNull();
  });

  it("subject なし → entityId は undefined", () => {
    const event = createDomainEvent({
      type: "reservation.created",
      tenantId: "t1",
      actor: { kind: "system", component: "scheduler" },
      risk: "medium",
      payload: {},
    });

    const req = toPriorityRecalcRequest(event);
    expect(req).not.toBeNull();
    expect(req!.entityId).toBeUndefined();
  });
});
