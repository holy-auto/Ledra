import { describe, it, expect } from "vitest";
import { buildDeterministicInvoiceDraft } from "../invoiceFromJob";
import { buildDeterministicQuote } from "../quoteFromVehicle";
import { categorizeAccountingLines } from "../accountingCategoryEstimate";

describe("buildDeterministicInvoiceDraft", () => {
  it("expands menu items 1:1 into invoice lines", () => {
    const draft = buildDeterministicInvoiceDraft({
      customerName: "山田 太郎",
      customerType: "individual",
      menuItems: [
        { name: "ガラスコーティング", unit_price: 60000, quantity: 1 },
        { name: "ホイール撥水", unit_price: 8000, quantity: 4 },
      ],
    });
    expect(draft.items).toEqual([
      { description: "ガラスコーティング", quantity: 1, unit: "式", unit_price: 60000 },
      { description: "ホイール撥水", quantity: 4, unit: "式", unit_price: 8000 },
    ]);
    expect(draft.recipient_name).toBe("山田 太郎 様");
  });

  it("falls back to estimated_amount when menu is empty", () => {
    const draft = buildDeterministicInvoiceDraft({
      customerName: "アクメ商事",
      customerType: "corporate",
      estimatedAmount: 45000,
      serviceCategory: "コーティング",
      menuItems: [],
    });
    expect(draft.items).toEqual([
      { description: "コーティング 一式", quantity: 1, unit: "式", unit_price: 45000 },
    ]);
    expect(draft.recipient_name).toBe("アクメ商事 御中");
  });

  it("includes vehicle info in the note when present", () => {
    const draft = buildDeterministicInvoiceDraft({
      customerName: "山田",
      customerType: "individual",
      vehicle: { maker: "トヨタ", model: "プリウス", plate_display: "水戸 300 あ 12-34" },
      menuItems: [{ name: "コーティング", unit_price: 60000, quantity: 1 }],
    });
    expect(draft.note).toContain("プリウス");
    expect(draft.note).toContain("水戸 300 あ 12-34");
  });

  it("returns empty items when there is no source data", () => {
    const draft = buildDeterministicInvoiceDraft({
      customerName: null,
      customerType: null,
      menuItems: [],
    });
    expect(draft.items).toEqual([]);
    expect(draft.recipient_name).toBe("");
  });
});

describe("buildDeterministicQuote", () => {
  it("applies size multiplier to baseMenu", () => {
    const draft = buildDeterministicQuote({
      vehicle: { size_class: "L" },
      serviceCategory: "コーティング",
      pastInvoices: [],
      baseMenu: [{ name: "ガラスコーティング", default_price: 100000 }],
    });
    // L = +15%
    expect(draft.items[0].unit_price).toBe(115000);
    expect(draft.total).toBe(115000);
  });

  it("returns most frequent items from past invoices when no baseMenu", () => {
    const draft = buildDeterministicQuote({
      vehicle: { size_class: "M" },
      serviceCategory: "コーティング",
      pastInvoices: [
        { items: [{ description: "コーティング", unit_price: 60000, quantity: 1 }], total: 60000 },
        { items: [{ description: "コーティング", unit_price: 70000, quantity: 1 }], total: 70000 },
        { items: [{ description: "鉄粉除去", unit_price: 8000, quantity: 1 }], total: 8000 },
      ],
    });
    // Most frequent = コーティング, M = +10% → avg(60000, 70000) * 1.1 = 71500
    expect(draft.items[0].description).toBe("コーティング");
    expect(draft.items[0].unit_price).toBe(71500);
  });

  it("falls back to a single placeholder when no data", () => {
    const draft = buildDeterministicQuote({
      vehicle: {},
      serviceCategory: "板金修理",
      pastInvoices: [],
    });
    expect(draft.items[0].description).toBe("板金修理 一式");
    expect(draft.items[0].unit_price).toBe(0);
    expect(draft.confidence).toBeLessThan(0.5);
  });

  it("sets validity_days to a sane default", () => {
    const draft = buildDeterministicQuote({
      vehicle: {},
      serviceCategory: "コート",
      pastInvoices: [],
    });
    expect(draft.validity_days).toBe(30);
  });
});

describe("categorizeAccountingLines", () => {
  const accounts = [
    { code: "411", label: "売上高", keywords: ["施工", "コーティング", "コート"] },
    { code: "501", label: "売上原価", keywords: ["材料", "薬剤", "コーティング剤"] },
    { code: "742", label: "雑収入", keywords: ["値引", "返金"] },
  ];

  it("matches by keyword first (confidence 1.0)", async () => {
    const out = await categorizeAccountingLines(
      [{ description: "ガラスコーティング施工", amount: 60000 }],
      accounts,
      "411",
    );
    expect(out.lines[0].method).toBe("rule");
    expect(out.lines[0].suggested_code).toBe("411");
    expect(out.lines[0].confidence).toBe(1.0);
  });

  it("falls back to fallbackCode when no rule matches and no API key", async () => {
    const out = await categorizeAccountingLines(
      [{ description: "とても特殊な明細", amount: 1000 }],
      accounts,
      "411",
    );
    expect(out.lines[0].method).toBe("fallback");
    expect(out.lines[0].suggested_code).toBe("411");
    expect(out.lines[0].confidence).toBe(0);
  });

  it("respects fallbackCode when label exists in accounts", async () => {
    const out = await categorizeAccountingLines(
      [{ description: "不明な明細", amount: 1000 }],
      accounts,
      "411",
    );
    expect(out.lines[0].suggested_label).toBe("売上高");
  });
});
