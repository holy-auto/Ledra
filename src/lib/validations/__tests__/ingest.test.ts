import { describe, it, expect } from "vitest";
import { ingestCustomersSchema, ingestVehiclesSchema, ingestWorkHistorySchema } from "../ingest";
import { dedupeByRef } from "@/lib/api/ingest";

describe("ingestCustomersSchema", () => {
  it("accepts a minimal valid record", () => {
    const r = ingestCustomersSchema.safeParse({
      source_system: "broadleaf",
      records: [{ external_ref: "C-001", name: "山田太郎" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty records", () => {
    const r = ingestCustomersSchema.safeParse({ source_system: "x", records: [] });
    expect(r.success).toBe(false);
  });

  it("rejects missing external_ref", () => {
    const r = ingestCustomersSchema.safeParse({
      source_system: "x",
      records: [{ name: "山田太郎" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = ingestCustomersSchema.safeParse({
      source_system: "x",
      records: [{ external_ref: "C-1", name: "n", email: "not-an-email" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 500 records", () => {
    const records = Array.from({ length: 501 }, (_, i) => ({ external_ref: `C-${i}`, name: "n" }));
    const r = ingestCustomersSchema.safeParse({ source_system: "x", records });
    expect(r.success).toBe(false);
  });

  it("accepts corporate fields", () => {
    const r = ingestCustomersSchema.safeParse({
      source_system: "erp",
      records: [
        {
          external_ref: "C-1",
          name: "株式会社サンプル",
          customer_type: "corporate",
          corporate_number: "1234567890123",
          invoice_registration_number: "T1234567890123",
          billing_cycle: "consolidated",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a corporate_number that is not 13 digits", () => {
    const r = ingestCustomersSchema.safeParse({
      source_system: "erp",
      records: [{ external_ref: "C-1", name: "n", corporate_number: "12345" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("ingestVehiclesSchema", () => {
  it("accepts a record with only external_ref", () => {
    const r = ingestVehiclesSchema.safeParse({
      source_system: "erp",
      records: [{ external_ref: "V-1" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an out-of-range year", () => {
    const r = ingestVehiclesSchema.safeParse({
      source_system: "erp",
      records: [{ external_ref: "V-1", year: 1800 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("ingestWorkHistorySchema", () => {
  it("requires vehicle_external_ref, type and title", () => {
    const ok = ingestWorkHistorySchema.safeParse({
      source_system: "erp",
      records: [{ external_ref: "W-1", vehicle_external_ref: "V-1", type: "oil", title: "オイル交換" }],
    });
    expect(ok.success).toBe(true);

    const missing = ingestWorkHistorySchema.safeParse({
      source_system: "erp",
      records: [{ external_ref: "W-1", type: "oil", title: "オイル交換" }],
    });
    expect(missing.success).toBe(false);
  });

  it("rejects a non-ISO performed_at", () => {
    const r = ingestWorkHistorySchema.safeParse({
      source_system: "erp",
      records: [
        { external_ref: "W-1", vehicle_external_ref: "V-1", type: "oil", title: "t", performed_at: "2026/01/01" },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("dedupeByRef", () => {
  it("keeps the last record for a duplicated external_ref", () => {
    const out = dedupeByRef([
      { external_ref: "A", name: "first" },
      { external_ref: "B", name: "b" },
      { external_ref: "A", name: "last" },
    ]);
    expect(out).toHaveLength(2);
    const a = out.find((r) => r.external_ref === "A");
    expect(a?.name).toBe("last");
  });
});
