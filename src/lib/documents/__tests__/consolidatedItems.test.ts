import { describe, it, expect } from "vitest";
import { buildConsolidatedItems, consolidatedHeading } from "../consolidatedItems";
import { calcItems } from "../calcItems";
import type { ConsolidatedSource } from "../consolidatedSources";
import type { DocumentItem } from "@/types/document";

const item = (description: string, unit_price: number, extra: Partial<DocumentItem> = {}): DocumentItem => ({
  item_type: "item",
  description,
  quantity: 1,
  unit: "式",
  unit_price,
  amount: unit_price,
  ...extra,
});

function src(over: Partial<ConsolidatedSource> & { id: string }): ConsolidatedSource {
  return {
    doc_type: "invoice",
    doc_number: `INV-${over.id}`,
    issued_at: "2026-10-01",
    subject: null,
    vehicle_info_json: {},
    items_json: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    tax_rate: 10,
    meta_json: { is_tax_inclusive: false },
    ...over,
  } as ConsolidatedSource;
}

describe("buildConsolidatedItems", () => {
  it("元帳票ごとに『車両の見出し → 元の明細 → 小計』で並べ、小計は元帳票ごとに区切って計算される", () => {
    const built = buildConsolidatedItems([
      src({
        id: "a",
        vehicle_info_json: { plate: "U632", model: "95プラド" },
        items_json: [item("内装張替え工賃", 50000), item("内装生地（L-6217）", 20592)],
      }),
      src({ id: "b", vehicle_info_json: { model: "ハイエース" }, items_json: [item("ボディコーティング", 30000)] }),
    ]);
    expect(built).not.toBeNull();
    const { itemsJson, subtotal, tax, total } = calcItems(built!.items, built!.taxRate, built!.isTaxInclusive);

    expect(itemsJson.map((r) => [r.item_type, r.description, r.amount])).toEqual([
      ["heading", "U632 95プラド", 0],
      ["item", "内装張替え工賃", 50000],
      ["item", "内装生地（L-6217）", 20592],
      ["subtotal", "小計", 70592],
      ["heading", "ハイエース", 0],
      ["item", "ボディコーティング", 30000],
      ["subtotal", "小計", 30000],
    ]);
    // 税抜 100,592 円・10% は合算後にまとめて計算（端数は四捨五入で 10,059 円）
    expect([subtotal, tax, total]).toEqual([100592, 10059, 110651]);
  });

  it("車両が無ければ件名、件名も無ければ帳票番号を見出しにする", () => {
    expect(consolidatedHeading(src({ id: "x", subject: "内装リペア" }))).toBe("内装リペア");
    expect(consolidatedHeading(src({ id: "y" }))).toBe("請求書 INV-y");
  });

  it("税抜では元帳票の既定税率を明細に明示し、軽減税率の行はそのまま 8% で集計する", () => {
    const built = buildConsolidatedItems([
      src({ id: "a", items_json: [item("工賃", 10000)] }),
      src({ id: "b", items_json: [item("飲料", 1000, { tax_category: 8 })] }),
    ]);
    const { taxBreakdown } = calcItems(built!.items, built!.taxRate, built!.isTaxInclusive);
    expect(taxBreakdown).toEqual(
      expect.arrayContaining([
        { rate: 10, subtotal: 10000, tax: 1000 },
        { rate: 8, subtotal: 1000, tax: 80 },
      ]),
    );
  });

  it("税込と税抜が混在する・税込で税率が混在するときは、まとめられないので null", () => {
    expect(
      buildConsolidatedItems([
        src({ id: "a", items_json: [item("工賃", 1000)] }),
        src({ id: "b", items_json: [item("工賃", 1000)], meta_json: { is_tax_inclusive: true } }),
      ]),
    ).toBeNull();
    const incl = { is_tax_inclusive: true };
    expect(
      buildConsolidatedItems([
        src({ id: "a", items_json: [item("工賃", 1100)], meta_json: incl }),
        src({ id: "b", items_json: [item("飲料", 108, { tax_category: 8 })], meta_json: incl }),
      ]),
    ).toBeNull();
  });
});
