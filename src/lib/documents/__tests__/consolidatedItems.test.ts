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
  // 保存額は明細から（実データと同じく、明細を計算し直すと保存額が再現できる状態）
  const sum = (over.items_json ?? [])
    .filter((it) => (it.item_type ?? "item") === "item")
    .reduce((n, it) => n + it.amount, 0);
  return {
    doc_type: "invoice",
    doc_number: `INV-${over.id}`,
    issued_at: "2026-10-01",
    subject: null,
    vehicle_info_json: {},
    items_json: [],
    subtotal: sum,
    tax: 0,
    total: sum,
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
        subject: "U632",
        vehicle_info_json: { model: "95プラド" },
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

  it("見出しは『件名 車種 ナンバー』のうち入っているものを並べ、どれも無ければ帳票番号", () => {
    const vehicle = { model: "95プラド", plate: "品川300あ1234" };
    expect(consolidatedHeading(src({ id: "w", subject: "U632", vehicle_info_json: vehicle }))).toBe(
      "U632 95プラド 品川300あ1234",
    );
    expect(consolidatedHeading(src({ id: "x", vehicle_info_json: vehicle }))).toBe("95プラド 品川300あ1234");
    expect(consolidatedHeading(src({ id: "x2", subject: "U632" }))).toBe("U632");
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

  it("元帳票の中の小計行は落とし、車両ごとの小計がその元帳票の全明細を数える", () => {
    const built = buildConsolidatedItems([
      src({
        id: "a",
        items_json: [
          item("A", 50000),
          item("B", 20000),
          { item_type: "subtotal", description: "小計", quantity: 0, unit_price: 0, amount: 0 },
          item("C", 5000),
        ],
      }),
    ]);
    const { itemsJson } = calcItems(built!.items, built!.taxRate, built!.isTaxInclusive);
    expect(itemsJson.filter((r) => r.item_type === "subtotal").map((r) => r.amount)).toEqual([75000]);
  });

  it("明細から計算し直した金額が元帳票の保存額と合わない（旧データ等）ときは、請求額を変えないよう null", () => {
    expect(
      buildConsolidatedItems([{ ...src({ id: "a", items_json: [item("工賃", 1000)] }), subtotal: 5000 }]),
    ).toBeNull();
    expect(buildConsolidatedItems([{ ...src({ id: "a" }), subtotal: 5000 }])).toBeNull();
  });

  it("tax_category の無い古い軽減税率の行（is_reduced_rate のみ）は 8% で集計する", () => {
    const legacy = { ...item("飲料", 1000), is_reduced_rate: true } as DocumentItem;
    const built = buildConsolidatedItems([src({ id: "a", items_json: [legacy] })]);
    const { taxBreakdown } = calcItems(built!.items, built!.taxRate, built!.isTaxInclusive);
    expect(taxBreakdown).toEqual([{ rate: 8, subtotal: 1000, tax: 80 }]);
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
