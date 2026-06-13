import { describe, expect, it } from "vitest";
import { buildAccountingCsv, summarize, isAccountingFormat, type AccountingRow } from "@/lib/accounting/export";

function row(over: Partial<AccountingRow> = {}): AccountingRow {
  return {
    id: "doc-1",
    invoice_number: "INV-202606-001",
    customer_name: "山田太郎",
    issued_at: "2026-06-10",
    payment_date: "2026-06-12",
    status: "paid",
    subtotal: 10000,
    tax: 1000,
    total: 11000,
    ...over,
  };
}

describe("isAccountingFormat", () => {
  it("accepts known formats and rejects others", () => {
    expect(isAccountingFormat("freee")).toBe(true);
    expect(isAccountingFormat("mfcloud")).toBe(true);
    expect(isAccountingFormat("generic")).toBe(true);
    expect(isAccountingFormat("xlsx")).toBe(false);
    expect(isAccountingFormat(null)).toBe(false);
  });
});

describe("summarize", () => {
  it("aggregates subtotal/tax/total and count", () => {
    const s = summarize([row(), row({ id: "doc-2", subtotal: 5000, tax: 500, total: 5500 })], 2026, 6);
    expect(s.year).toBe(2026);
    expect(s.month).toBe(6);
    expect(s.count).toBe(2);
    expect(s.subtotal_total).toBe(15000);
    expect(s.tax_total).toBe(1500);
    expect(s.grand_total).toBe(16500);
  });

  it("returns zeros for an empty list", () => {
    const s = summarize([], 2026, 6);
    expect(s.count).toBe(0);
    expect(s.grand_total).toBe(0);
  });
});

describe("buildAccountingCsv", () => {
  it("freee: header columns and income row use payment_date and total", () => {
    const csv = buildAccountingCsv([row()], "freee");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("取引日,収入金額,支出金額,勘定科目,取引先,備考");
    // 取引日は payment_date を / 区切りに、収入金額は total。
    expect(lines[1]).toContain("2026/06/12");
    expect(lines[1]).toContain("11000");
    expect(lines[1]).toContain("売上高");
    expect(lines[1]).toContain("山田太郎");
  });

  it("mfcloud: header + double-entry debit/credit rows with tax split", () => {
    const csv = buildAccountingCsv([row()], "mfcloud");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("日付,借方勘定科目,借方税区分,借方金額,貸方勘定科目,貸方税区分,貸方金額,摘要");
    // 1 行目: 売掛金(総額) / 売上高(税抜)
    expect(lines[1]).toContain("売掛金");
    expect(lines[1]).toContain("売上高");
    expect(lines[1]).toContain("10000"); // subtotal as credit amount
    // 税行が分かれている
    expect(csv).toContain("仮受消費税");
    expect(csv).toContain("1000");
  });

  it("mfcloud: omits the tax row when tax is zero", () => {
    const csv = buildAccountingCsv([row({ tax: 0 })], "mfcloud");
    expect(csv).not.toContain("仮受消費税");
  });

  it("generic: header and field order", () => {
    const csv = buildAccountingCsv([row()], "generic");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("date,invoice_number,customer_name,subtotal,tax,total,status");
    expect(lines[1]).toBe("2026-06-12,INV-202606-001,山田太郎,10000,1000,11000,paid");
  });

  it("escapes commas and quotes in customer name", () => {
    const csv = buildAccountingCsv([row({ customer_name: '田中, "株"' })], "generic");
    // カンマ・引用符を含む値は "" で囲み内部の " をエスケープ。
    expect(csv).toContain('"田中, ""株"""');
  });

  it("falls back to issued_at when payment_date is null (generic date column)", () => {
    const csv = buildAccountingCsv([row({ payment_date: null })], "generic");
    const lines = csv.split("\r\n");
    expect(lines[1].startsWith("2026-06-10,")).toBe(true);
  });
});
