/**
 * Vehicle-customer relationship type model tests (IMP-025, ADR-0006).
 *
 * These tests verify the type contracts and PII field registries.
 * The relationship types are preparation for the DB migration
 * (IMP-050); the PII registries are active guards used by
 * passport PII shielding tests.
 */
import { describe, it, expect } from "vitest";
import {
  VEHICLE_TABLE_PII_COLUMNS,
  PASSPORT_TABLE_PII_COLUMNS,
  type VehicleCustomerRelation,
  type VehicleCustomerRelationType,
  type VehicleRelationEndReason,
  type PublicVehicleIdentity,
} from "@/lib/vehicles/customerRelation";

describe("VehicleCustomerRelationType", () => {
  it("covers the three relationship modes", () => {
    // Type check: these assignments must compile
    const types: VehicleCustomerRelationType[] = ["owner", "lessee", "user"];
    expect(types).toHaveLength(3);
  });
});

describe("VehicleRelationEndReason", () => {
  it("covers all end reasons", () => {
    const reasons: VehicleRelationEndReason[] = ["sold", "transferred", "returned", "unlinked", "customer_deleted"];
    expect(reasons).toHaveLength(5);
  });
});

describe("VehicleCustomerRelation", () => {
  it("has the expected shape", () => {
    const rel: VehicleCustomerRelation = {
      vehicleId: "v-1",
      customerId: "c-1",
      tenantId: "t-1",
      relationType: "owner",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: null,
      endReason: null,
    };
    expect(rel.endedAt).toBeNull();
    expect(rel.relationType).toBe("owner");
  });

  it("can represent an ended relationship", () => {
    const rel: VehicleCustomerRelation = {
      vehicleId: "v-1",
      customerId: "c-1",
      tenantId: "t-1",
      relationType: "owner",
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-06-01T00:00:00Z",
      endReason: "sold",
    };
    expect(rel.endedAt).not.toBeNull();
    expect(rel.endReason).toBe("sold");
  });
});

describe("PublicVehicleIdentity", () => {
  it("contains only non-PII fields", () => {
    const id: PublicVehicleIdentity = {
      vinNormalized: "JH4DC53001S000001",
      maker: "Honda",
      model: "Integra",
      year: 2001,
    };
    // Verify these keys don't overlap with any PII columns
    const keys = Object.keys(id);
    const allPII = [...VEHICLE_TABLE_PII_COLUMNS, ...PASSPORT_TABLE_PII_COLUMNS];
    const overlap = keys.filter((k) => allPII.includes(k as (typeof allPII)[number]));
    expect(overlap).toEqual([]);
  });
});

describe("PII column registries", () => {
  it("VEHICLE_TABLE_PII_COLUMNS has no duplicates", () => {
    const set = new Set(VEHICLE_TABLE_PII_COLUMNS);
    expect(set.size).toBe(VEHICLE_TABLE_PII_COLUMNS.length);
  });

  it("PASSPORT_TABLE_PII_COLUMNS has no duplicates", () => {
    const set = new Set(PASSPORT_TABLE_PII_COLUMNS);
    expect(set.size).toBe(PASSPORT_TABLE_PII_COLUMNS.length);
  });

  it("no overlap between vehicle and passport PII columns", () => {
    const vehicleSet = new Set<string>(VEHICLE_TABLE_PII_COLUMNS);
    const overlap = [...PASSPORT_TABLE_PII_COLUMNS].filter((c) => vehicleSet.has(c));
    expect(overlap).toEqual([]);
  });
});
