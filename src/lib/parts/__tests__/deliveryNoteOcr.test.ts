import { describe, it, expect } from "vitest";
import { toLineItems, type DeliveryNoteExtract } from "@/lib/ai/deliveryNoteOcr";
import { installationMatchKey } from "@/lib/parts/reconcileService";

describe("toLineItems", () => {
  it("code を優先して key にする（小文字化）", () => {
    const ex: DeliveryNoteExtract = {
      supplier_name: "X商会",
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [{ label: "ブレーキパッド", code: "4901234567894", quantity: 2, unit_price_jpy: 6000, amount_jpy: 12000 }],
    };
    const items = toLineItems(ex);
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("4901234567894");
    expect(items[0].quantity).toBe(2);
    expect(items[0].amountJpy).toBe(12000);
  });

  it("code が無ければ品名を key にする", () => {
    const ex: DeliveryNoteExtract = {
      supplier_name: null,
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [{ label: "オイル", code: null, quantity: 4, unit_price_jpy: null, amount_jpy: null }],
    };
    expect(toLineItems(ex)[0].key).toBe("オイル".toLowerCase());
  });

  it("同一 key は数量・金額を合算する", () => {
    const ex: DeliveryNoteExtract = {
      supplier_name: null,
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [
        { label: "パッド", code: "G1", quantity: 2, unit_price_jpy: null, amount_jpy: 1000 },
        { label: "パッド", code: "g1", quantity: 3, unit_price_jpy: null, amount_jpy: 1500 },
      ],
    };
    const items = toLineItems(ex);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
    expect(items[0].amountJpy).toBe(2500);
  });

  it("空 key の行は無視する", () => {
    const ex: DeliveryNoteExtract = {
      supplier_name: null,
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [{ label: "", code: null, quantity: 1, unit_price_jpy: null, amount_jpy: null }],
    };
    expect(toLineItems(ex)).toEqual([]);
  });
});

describe("installationMatchKey", () => {
  it("GTIN を優先（小文字化）", () => {
    expect(installationMatchKey("4901234567894", "パッド")).toBe("4901234567894");
  });
  it("GTIN 無しは品名", () => {
    expect(installationMatchKey(null, "Oil Filter")).toBe("oil filter");
  });
  it("OCR の key と一致する（突合できる）", () => {
    const ex: DeliveryNoteExtract = {
      supplier_name: null,
      delivery_date: null,
      customer_ref: null,
      vehicle_chassis: null,
      remarks: null,
      lines: [{ label: "X", code: "G1", quantity: 1, unit_price_jpy: null, amount_jpy: null }],
    };
    expect(toLineItems(ex)[0].key).toBe(installationMatchKey("G1", "X"));
  });
});
