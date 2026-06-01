import { describe, it, expect } from "vitest";
import {
  isSafeOrderEndpoint,
  buildAuthHeaders,
  buildOrderRequestBody,
  extractExternalOrderId,
  type PlaceOrderInput,
} from "../placeOrder";

describe("isSafeOrderEndpoint (SSRF 緩和)", () => {
  it("accepts a public https URL", () => {
    expect(isSafeOrderEndpoint("https://api.example.com/v1/orders")).toBe(true);
  });
  it("rejects http", () => {
    expect(isSafeOrderEndpoint("http://api.example.com/orders")).toBe(false);
  });
  it("rejects localhost and loopback", () => {
    expect(isSafeOrderEndpoint("https://localhost/x")).toBe(false);
    expect(isSafeOrderEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(isSafeOrderEndpoint("https://[::1]/x")).toBe(false);
  });
  it("rejects private ranges and link-local/metadata", () => {
    expect(isSafeOrderEndpoint("https://10.0.0.5/x")).toBe(false);
    expect(isSafeOrderEndpoint("https://192.168.1.1/x")).toBe(false);
    expect(isSafeOrderEndpoint("https://172.16.0.1/x")).toBe(false);
    expect(isSafeOrderEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isSafeOrderEndpoint("not a url")).toBe(false);
  });
});

describe("buildAuthHeaders", () => {
  it("api_key uses X-API-Key by default", () => {
    expect(buildAuthHeaders("api_key", "k123")).toEqual({ "X-API-Key": "k123" });
  });
  it("api_key honors a custom header_name", () => {
    expect(buildAuthHeaders("api_key", "k123", { header_name: "X-Token" })).toEqual({ "X-Token": "k123" });
  });
  it("bearer/oauth2 use Authorization: Bearer", () => {
    expect(buildAuthHeaders("bearer", "tok")).toEqual({ Authorization: "Bearer tok" });
    expect(buildAuthHeaders("oauth2", "tok")).toEqual({ Authorization: "Bearer tok" });
  });
  it("none or missing key yields no auth header", () => {
    expect(buildAuthHeaders("none", "k")).toEqual({});
    expect(buildAuthHeaders("api_key", null)).toEqual({});
  });
});

describe("buildOrderRequestBody (数値は入力どおり)", () => {
  const input: PlaceOrderInput = {
    poNumber: "PO-1",
    shopName: "店",
    subtotal: 27600,
    note: null,
    items: [
      { name: "A", sku: "SKU-A", quantity: 3, unit_cost: 3200 },
      { name: "B", sku: null, quantity: 10, unit_cost: null },
    ],
  };
  it("maps items and preserves quantities/amounts", () => {
    const body = buildOrderRequestBody(input);
    expect(body.po_number).toBe("PO-1");
    expect(body.subtotal).toBe(27600);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ sku: "SKU-A", name: "A", quantity: 3, unit_cost: 3200 });
    // null は undefined に落として送らない
    expect(items[1].sku).toBeUndefined();
    expect(items[1].unit_cost).toBeUndefined();
  });
});

describe("extractExternalOrderId", () => {
  it("finds common id keys", () => {
    expect(extractExternalOrderId({ order_id: "ORD-9" })).toBe("ORD-9");
    expect(extractExternalOrderId({ id: 12345 })).toBe("12345");
    expect(extractExternalOrderId({ orderNumber: "X-1" })).toBe("X-1");
  });
  it("honors a configured dot-path", () => {
    expect(extractExternalOrderId({ data: { ref: "R-7" } }, { order_id_path: "data.ref" })).toBe("R-7");
  });
  it("returns null when nothing matches", () => {
    expect(extractExternalOrderId({ foo: "bar" })).toBeNull();
    expect(extractExternalOrderId(null)).toBeNull();
    expect(extractExternalOrderId("nope")).toBeNull();
  });
});
