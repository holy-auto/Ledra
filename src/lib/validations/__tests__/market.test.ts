import { describe, expect, it } from "vitest";
import { dealCreateSchema, marketVehicleCreateSchema } from "@/lib/validations/market";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("dealCreateSchema", () => {
  it("accepts inquiry_id alone (vehicle/buyer derived server-side)", () => {
    const r = dealCreateSchema.safeParse({ inquiry_id: UUID });
    expect(r.success).toBe(true);
  });

  it("still accepts explicit overrides", () => {
    const r = dealCreateSchema.safeParse({
      inquiry_id: UUID,
      vehicle_id: UUID,
      buyer_name: "山田",
      buyer_email: "y@example.com",
      agreed_price: 1500000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing inquiry_id", () => {
    const r = dealCreateSchema.safeParse({ vehicle_id: UUID });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed buyer_email when provided", () => {
    const r = dealCreateSchema.safeParse({ inquiry_id: UUID, buyer_email: "not-an-email" });
    expect(r.success).toBe(false);
  });
});

describe("marketVehicleCreateSchema", () => {
  it("accepts and retains cost / supplier / acquisition fields", () => {
    const r = marketVehicleCreateSchema.safeParse({
      maker: "トヨタ",
      model: "アクア",
      cost_price: 800000,
      supplier_name: "オークションA",
      acquisition_date: "2026-05-01",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cost_price).toBe(800000);
      expect(r.data.supplier_name).toBe("オークションA");
      expect(r.data.acquisition_date).toBe("2026-05-01");
    }
  });

  it("normalizes empty supplier_name to null", () => {
    const r = marketVehicleCreateSchema.safeParse({ maker: "トヨタ", model: "アクア", supplier_name: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.supplier_name).toBeNull();
  });

  it("rejects a negative cost_price", () => {
    const r = marketVehicleCreateSchema.safeParse({ maker: "トヨタ", model: "アクア", cost_price: -1 });
    expect(r.success).toBe(false);
  });
});
