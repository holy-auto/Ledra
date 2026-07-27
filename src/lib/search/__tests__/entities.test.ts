import { describe, it, expect } from "vitest";
import { entityResultsToChips, type EntitySearchResults } from "@/lib/search/entities";

// エンティティ検索結果 → 候補チップ（詳細URL + ラベル）の純変換を検査。
// 重要: 証明書は public_id で開く（id ではない）。URL 形式と1件時の扱いを固定する。
describe("entityResultsToChips", () => {
  const base: EntitySearchResults = { certificates: [], customers: [], vehicles: [], invoices: [] };

  it("maps a customer to /admin/customers/{id}", () => {
    const chips = entityResultsToChips({ ...base, customers: [{ id: "cust-1", name: "田中太郎", email: null }] });
    expect(chips).toHaveLength(1);
    expect(chips[0].href).toBe("/admin/customers/cust-1");
    expect(chips[0].label).toContain("田中太郎");
  });

  it("uses certificate public_id (NOT id) for the detail URL", () => {
    const chips = entityResultsToChips({
      ...base,
      certificates: [{ public_id: "LD-001", customer_name: "田中太郎", status: "issued" }],
    });
    expect(chips[0].href).toBe("/admin/certificates/LD-001");
  });

  it("maps a vehicle to /admin/vehicles/{id} and surfaces plate or VIN in the label", () => {
    const chips = entityResultsToChips({
      ...base,
      vehicles: [{ id: "veh-9", maker: "トヨタ", model: "プリウス", plate_number: "品川300", vin: "ABC123" }],
    });
    expect(chips[0].href).toBe("/admin/vehicles/veh-9");
    expect(chips[0].label).toContain("品川300");
  });

  it("falls back to VIN in the vehicle label when plate is missing", () => {
    const chips = entityResultsToChips({
      ...base,
      vehicles: [{ id: "veh-9", maker: null, model: null, plate_number: null, vin: "ABC123" }],
    });
    expect(chips[0].label).toContain("ABC123");
  });

  it("maps an invoice to /admin/invoices/{id}", () => {
    const chips = entityResultsToChips({
      ...base,
      invoices: [{ id: "inv-3", invoice_number: "INV-2024", customer_name: "田中太郎", status: "paid" }],
    });
    expect(chips[0].href).toBe("/admin/invoices/inv-3");
  });

  it("returns chips for all groups combined, in customer→vehicle→certificate→invoice order", () => {
    const chips = entityResultsToChips({
      certificates: [{ public_id: "LD-001", customer_name: null, status: null }],
      customers: [{ id: "c1", name: "A", email: null }],
      vehicles: [{ id: "v1", maker: "M", model: "X", plate_number: "P", vin: null }],
      invoices: [{ id: "i1", invoice_number: "N", customer_name: null, status: null }],
    });
    expect(chips.map((c) => c.href)).toEqual([
      "/admin/customers/c1",
      "/admin/vehicles/v1",
      "/admin/certificates/LD-001",
      "/admin/invoices/i1",
    ]);
  });
});
