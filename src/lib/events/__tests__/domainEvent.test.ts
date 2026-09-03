import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDomainEvent, eventRisk, type DomainEvent, type EventActor } from "../domainEvent";

describe("createDomainEvent()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const userActor: EventActor = { kind: "user", userId: "user-1" };

  it("creates event with defaults", () => {
    const event = createDomainEvent({
      type: "certificate.issued",
      tenantId: "tenant-1",
      actor: userActor,
      risk: "high",
      payload: { certificateId: "cert-1" },
    });

    expect(event.type).toBe("certificate.issued");
    expect(event.version).toBe(1);
    expect(event.tenantId).toBe("tenant-1");
    expect(event.actor).toEqual(userActor);
    expect(event.risk).toBe("high");
    expect(event.occurredAt).toBe("2026-08-19T12:00:00.000Z");
    expect(event.payload).toEqual({ certificateId: "cert-1" });
  });

  it("accepts custom version and occurredAt", () => {
    const event = createDomainEvent({
      type: "vehicle.registered",
      tenantId: "tenant-1",
      actor: userActor,
      risk: "medium",
      payload: {},
      version: 2,
      occurredAt: "2026-01-01T00:00:00Z",
    });

    expect(event.version).toBe(2);
    expect(event.occurredAt).toBe("2026-01-01T00:00:00Z");
  });

  it("passes through optional fields", () => {
    const event = createDomainEvent({
      type: "invoice.created",
      tenantId: "tenant-1",
      storeId: "store-1",
      actor: { kind: "system", component: "billing" },
      risk: "high",
      payload: {},
      idempotencyKey: "idem-123",
      subject: { kind: "invoice", id: "inv-1" },
    });

    expect(event.storeId).toBe("store-1");
    expect(event.idempotencyKey).toBe("idem-123");
    expect(event.subject).toEqual({ kind: "invoice", id: "inv-1" });
  });

  it("supports all actor kinds", () => {
    const actors: EventActor[] = [
      { kind: "user", userId: "u-1" },
      { kind: "system", component: "outbox-flush" },
      { kind: "ai", actionKey: "auto_create_reservation" },
      { kind: "cron", jobName: "data-retention" },
      { kind: "webhook", source: "stripe" },
    ];

    for (const actor of actors) {
      const event = createDomainEvent({
        type: "note.created",
        tenantId: "t-1",
        actor,
        risk: "low",
        payload: {},
      });
      expect(event.actor).toEqual(actor);
    }
  });
});

describe("eventRisk()", () => {
  it("returns critical for certificate.voided", () => {
    expect(eventRisk("certificate.voided")).toBe("critical");
  });

  it("returns high for certificate/invoice/member events", () => {
    expect(eventRisk("certificate.issued")).toBe("high");
    expect(eventRisk("invoice.created")).toBe("high");
    expect(eventRisk("member.added")).toBe("high");
    expect(eventRisk("payment.completed")).toBe("high");
  });

  it("returns medium for CRUD events", () => {
    expect(eventRisk("vehicle.registered")).toBe("medium");
    expect(eventRisk("customer.created")).toBe("medium");
    expect(eventRisk("reservation.created")).toBe("medium");
    expect(eventRisk("ai.auto_action_executed")).toBe("medium");
  });

  it("defaults to low for view/read events", () => {
    expect(eventRisk("certificate.viewed")).toBe("low");
    expect(eventRisk("certificate.public_viewed")).toBe("low");
    expect(eventRisk("certificate.pdf_generated")).toBe("low");
    expect(eventRisk("note.created")).toBe("low");
  });

  it("is consistent with IMP-013 operationRisk for overlapping operations", () => {
    // certificate.voided ↔ certificates:void → both critical
    expect(eventRisk("certificate.voided")).toBe("critical");
    // certificate.issued ↔ certificates:create → both high
    expect(eventRisk("certificate.issued")).toBe("high");
    // vehicle.registered ↔ vehicles:create → both medium
    expect(eventRisk("vehicle.registered")).toBe("medium");
  });
});
