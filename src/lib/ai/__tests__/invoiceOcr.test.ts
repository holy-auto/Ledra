import { describe, it, expect } from "vitest";
import { toDocumentItems, type InvoiceExtract } from "../invoiceOcr";

function extract(lines: InvoiceExtract["lines"]): InvoiceExtract {
  return {
    supplier_name: "テスト商会",
    invoice_number: null,
    issue_date: null,
    due_date: null,
    subtotal_jpy: null,
    tax_jpy: null,
    total_jpy: null,
    lines,
  };
}

describe("toDocumentItems", () => {
  it("単価×数量から金額を補完する", () => {
    const items = toDocumentItems(
      extract([
        {
          description: "エンジンオイル",
          item_code: "OIL-1",
          quantity: 3,
          unit_price_jpy: 1200,
          amount_jpy: null,
          tax_category: 10,
        },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "エンジンオイル",
      item_code: "OIL-1",
      quantity: 3,
      unit_price: 1200,
      amount: 3600,
      tax_category: 10,
    });
  });

  it("金額と数量から単価を補完する", () => {
    const items = toDocumentItems(
      extract([
        {
          description: "パッド",
          item_code: null,
          quantity: 2,
          unit_price_jpy: null,
          amount_jpy: 5000,
          tax_category: null,
        },
      ]),
    );
    expect(items[0].unit_price).toBe(2500);
    expect(items[0].amount).toBe(5000);
    expect(items[0].tax_category).toBe(10); // null → 既定10
  });

  it("軽減税率8%はそのまま、範囲外は10に寄せる", () => {
    const items = toDocumentItems(
      extract([
        { description: "飲料", item_code: null, quantity: 1, unit_price_jpy: 150, amount_jpy: 150, tax_category: 8 },
        { description: "部品", item_code: null, quantity: 1, unit_price_jpy: 100, amount_jpy: 100, tax_category: 5 },
      ]),
    );
    expect(items[0].tax_category).toBe(8);
    expect(items[1].tax_category).toBe(10);
  });

  it("数量が0/負/NaNは1に寄せる", () => {
    const items = toDocumentItems(
      extract([
        {
          description: "諸費用",
          item_code: null,
          quantity: 0,
          unit_price_jpy: null,
          amount_jpy: 800,
          tax_category: 10,
        },
      ]),
    );
    expect(items[0].quantity).toBe(1);
    expect(items[0].unit_price).toBe(800);
    expect(items[0].amount).toBe(800);
  });

  it("品名が空の行は捨てる", () => {
    const items = toDocumentItems(
      extract([
        { description: "  ", item_code: null, quantity: 1, unit_price_jpy: 100, amount_jpy: 100, tax_category: 10 },
        { description: "有効", item_code: null, quantity: 1, unit_price_jpy: 100, amount_jpy: 100, tax_category: 10 },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("有効");
  });

  it("単価・金額とも無い行は0に落ちる（クラッシュしない）", () => {
    const items = toDocumentItems(
      extract([
        { description: "不明", item_code: null, quantity: 2, unit_price_jpy: null, amount_jpy: null, tax_category: 10 },
      ]),
    );
    expect(items[0].unit_price).toBe(0);
    expect(items[0].amount).toBe(0);
  });
});
