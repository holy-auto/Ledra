import { describe, it, expect } from "vitest";
import {
  maintenancePackCreateSchema,
  maintenancePackUpdateSchema,
  maintenancePackUseSchema,
} from "../maintenance-pack";

// Zod v4 enforces RFC-9562: version 1-8 + variant 8/9/a/b. Use a real v4 UUID.
const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("maintenancePackCreateSchema", () => {
  it("accepts a minimal valid payload and defaults total_tickets to 1", () => {
    const r = maintenancePackCreateSchema.safeParse({ name: "3年保証メンテパック" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.total_tickets).toBe(1);
      expect(r.data.price).toBeNull();
      expect(r.data.customer_id).toBeNull();
      expect(r.data.vehicle_id).toBeNull();
      expect(r.data.valid_from).toBeNull();
      expect(r.data.valid_until).toBeNull();
    }
  });

  it("rejects empty / whitespace name", () => {
    expect(maintenancePackCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(maintenancePackCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects total_tickets < 1 and coerces strings", () => {
    expect(maintenancePackCreateSchema.safeParse({ name: "X", total_tickets: 0 }).success).toBe(false);
    const r = maintenancePackCreateSchema.safeParse({ name: "X", total_tickets: "5" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.total_tickets).toBe(5);
  });

  it("normalizes empty-string customer_id / vehicle_id to null", () => {
    const r = maintenancePackCreateSchema.safeParse({ name: "X", customer_id: "", vehicle_id: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customer_id).toBeNull();
      expect(r.data.vehicle_id).toBeNull();
    }
  });

  it("rejects a non-UUID customer_id", () => {
    expect(maintenancePackCreateSchema.safeParse({ name: "X", customer_id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid UUID customer_id", () => {
    const r = maintenancePackCreateSchema.safeParse({ name: "X", customer_id: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customer_id).toBe(VALID_UUID);
  });

  it("rejects malformed dates and accepts YYYY-MM-DD", () => {
    expect(maintenancePackCreateSchema.safeParse({ name: "X", valid_from: "2026/01/01" }).success).toBe(false);
    const r = maintenancePackCreateSchema.safeParse({ name: "X", valid_from: "2026-01-01" });
    expect(r.success).toBe(true);
  });

  it("rejects valid_from later than valid_until", () => {
    const r = maintenancePackCreateSchema.safeParse({
      name: "X",
      valid_from: "2026-12-31",
      valid_until: "2026-01-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative price", () => {
    expect(maintenancePackCreateSchema.safeParse({ name: "X", price: -1 }).success).toBe(false);
  });
});

describe("maintenancePackUpdateSchema", () => {
  it("requires id", () => {
    expect(maintenancePackUpdateSchema.safeParse({ name: "X" }).success).toBe(false);
    expect(maintenancePackUpdateSchema.safeParse({ id: VALID_UUID, name: "X" }).success).toBe(true);
  });

  it("accepts a status transition", () => {
    const r = maintenancePackUpdateSchema.safeParse({ id: VALID_UUID, status: "cancelled" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(maintenancePackUpdateSchema.safeParse({ id: VALID_UUID, status: "void" }).success).toBe(false);
  });
});

describe("maintenancePackUseSchema", () => {
  it("accepts an empty body", () => {
    const r = maintenancePackUseSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.reservation_id).toBeNull();
      expect(r.data.notes).toBeNull();
    }
  });

  it("accepts a valid reservation_id and notes", () => {
    const r = maintenancePackUseSchema.safeParse({ reservation_id: VALID_UUID, notes: "12ヶ月点検" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reservation_id).toBe(VALID_UUID);
  });

  it("rejects a non-UUID reservation_id", () => {
    expect(maintenancePackUseSchema.safeParse({ reservation_id: "nope" }).success).toBe(false);
  });
});
