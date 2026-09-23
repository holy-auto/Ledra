import { describe, it, expect } from "vitest";
import { toDocumentItems, detectTaxInclusive, toDraftHeader, type InvoiceExtract } from "../invoiceOcr";

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
    order_numbers: [],
    end_customer_name: null,
    sales_rep: null,
    vehicle_model: null,
    vehicle_color: null,
    vehicle_chassis_no: null,
    delivery_date: null,
    handwritten_notes: [],
  };
}

const line = (description: string, amount_jpy: number) => ({
  description,
  item_code: null,
  quantity: 1,
  unit_price_jpy: amount_jpy,
  amount_jpy,
  tax_category: null,
});

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

describe("detectTaxInclusive", () => {
  // 商談メモ（付属品明細）実例: 明細合計 62,600 = 合計欄、消費税 5,690 = 62,600×10/110 の切捨
  const memo = {
    ...extract([
      line("ETCセットアップ", 3300),
      line("納車前整備", 0),
      line("ナビイショク", 10000),
      line("リアモニターイショク", 10000),
      line("スピーカーイショク", 16000),
      line("タイヤ履き替え", 3300),
      line("部品代", 20000),
    ]),
    total_jpy: 62600,
    tax_jpy: 5690,
  };

  it("合計欄が明細合計と一致し税額が 10/110 なら内税", () => {
    expect(detectTaxInclusive(memo)).toBe(true);
  });

  it("値引き（負の行）を含んでも判定できる", () => {
    const e = { ...extract([line("ナビ", 325600), line("用品値引き", -65120)]), total_jpy: 260480, tax_jpy: 23680 };
    expect(detectTaxInclusive(e)).toBe(true);
  });

  it("税額が合計の 10% なら外税", () => {
    const e = { ...extract([line("施工", 10000)]), subtotal_jpy: 10000, tax_jpy: 1000, total_jpy: 11000 };
    // 合計欄(11000)は明細合計と一致しないので小計側で見る必要がある → total 優先で null
    expect(detectTaxInclusive(e)).toBeNull();
    expect(detectTaxInclusive({ ...e, total_jpy: null })).toBe(false);
  });

  it("金額が欠けていれば判定しない", () => {
    expect(detectTaxInclusive({ ...memo, tax_jpy: null })).toBeNull();
    expect(detectTaxInclusive({ ...memo, total_jpy: 99999 })).toBeNull();
  });
});

describe("toDraftHeader", () => {
  it("発注書のヘッダを件名・備考に整形する", () => {
    const h = toDraftHeader({
      ...extract([]),
      supplier_name: "研究学園店",
      invoice_number: "260901447",
      order_numbers: ["オーダーNo 88561"],
      end_customer_name: "山田 花子",
      sales_rep: "外山",
      vehicle_model: "N-BOX",
      vehicle_chassis_no: "1508937",
      vehicle_color: "白",
      delivery_date: "2026-09-26",
      handwritten_notes: ["12Vお願いします。"],
    });
    expect(h.subject).toBe("山田 花子 様 N-BOX（1508937）");
    expect(h.note).toBe(
      [
        "発行元: 研究学園店（担当: 外山）",
        "管理番号: 書類No 260901447 / オーダーNo 88561",
        "車両: N-BOX（1508937） / 白",
        "納車予定: 2026-09-26",
        "※ 12Vお願いします。",
      ].join("\n"),
    );
  });

  it("材料が無ければ null", () => {
    expect(toDraftHeader(extract([]))).toMatchObject({ subject: null, note: "発行元: テスト商会" });
    expect(toDraftHeader({ ...extract([]), supplier_name: null })).toEqual({
      subject: null,
      note: null,
      is_tax_inclusive: null,
    });
  });
});
