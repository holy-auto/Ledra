import { describe, it, expect } from "vitest";
import { supplyApiEndpointSchema, supplyProfileUpdateSchema, supplyProductSchema } from "../validation";
import { normalizeSupplyPartnerStatus, normalizeSupplyApiAuthType } from "@/types/supply";

describe("supplyApiEndpointSchema (https のみ許可)", () => {
  it("accepts an https URL", () => {
    expect(supplyApiEndpointSchema.safeParse("https://api.example.com/orders").success).toBe(true);
  });

  it("rejects http (平文) — SSRF / 盗聴を避ける", () => {
    const r = supplyApiEndpointSchema.safeParse("http://api.example.com/orders");
    expect(r.success).toBe(false);
  });

  it("rejects non-URL strings", () => {
    expect(supplyApiEndpointSchema.safeParse("not a url").success).toBe(false);
  });

  it("rejects other schemes (ftp/file)", () => {
    expect(supplyApiEndpointSchema.safeParse("ftp://example.com").success).toBe(false);
    expect(supplyApiEndpointSchema.safeParse("file:///etc/passwd").success).toBe(false);
  });
});

describe("supplyProfileUpdateSchema", () => {
  it("allows api_key omitted (据え置き) and null (消去) and string (更新)", () => {
    expect(supplyProfileUpdateSchema.safeParse({}).success).toBe(true);
    expect(supplyProfileUpdateSchema.safeParse({ api_key: null }).success).toBe(true);
    expect(supplyProfileUpdateSchema.safeParse({ api_key: "sk-live-xyz" }).success).toBe(true);
  });

  it("rejects an http api_endpoint", () => {
    expect(supplyProfileUpdateSchema.safeParse({ api_endpoint: "http://x.com" }).success).toBe(false);
  });

  it("rejects an unknown api_auth_type", () => {
    expect(supplyProfileUpdateSchema.safeParse({ api_auth_type: "basic" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(supplyProfileUpdateSchema.safeParse({ contact_email: "nope" }).success).toBe(false);
  });
});

describe("supplyProductSchema", () => {
  it("requires sku and name", () => {
    expect(supplyProductSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(supplyProductSchema.safeParse({ sku: "x" }).success).toBe(false);
    expect(supplyProductSchema.safeParse({ sku: "A-1", name: "コーティング剤" }).success).toBe(true);
  });

  it("defaults currency to JPY and is_active to true", () => {
    const r = supplyProductSchema.safeParse({ sku: "A-1", name: "x" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe("JPY");
      expect(r.data.is_active).toBe(true);
    }
  });

  it("rejects negative list_price", () => {
    expect(supplyProductSchema.safeParse({ sku: "A", name: "x", list_price: -1 }).success).toBe(false);
  });
});

describe("type normalizers", () => {
  it("normalizeSupplyPartnerStatus falls back to 審査待ち for unknown", () => {
    expect(normalizeSupplyPartnerStatus("active")).toBe("active");
    expect(normalizeSupplyPartnerStatus("suspended")).toBe("suspended");
    expect(normalizeSupplyPartnerStatus("garbage")).toBe("active_pending_review");
    expect(normalizeSupplyPartnerStatus(null)).toBe("active_pending_review");
  });

  it("normalizeSupplyApiAuthType falls back to none for unknown", () => {
    expect(normalizeSupplyApiAuthType("bearer")).toBe("bearer");
    expect(normalizeSupplyApiAuthType("basic")).toBe("none");
    expect(normalizeSupplyApiAuthType(undefined)).toBe("none");
  });
});
