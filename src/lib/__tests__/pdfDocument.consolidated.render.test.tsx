/**
 * 合算請求書の PDF に「合算内訳」ページ（元帳票ごとの明細）が付くことを確認する。
 * 合算請求書の本体明細は元帳票1件=1行（合計額のみ）なので、内訳が無いと受け取った顧客が何の請求か追えない。
 */
import { describe, it, expect } from "vitest";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "../pdfDocument";
import type { ConsolidatedSource } from "@/lib/documents/consolidatedSources";

const doc = {
  id: "cinv-1",
  doc_type: "consolidated_invoice",
  doc_number: "CINV-001",
  issued_at: "2026-10-01",
  due_date: null,
  subtotal: 30000,
  tax: 3000,
  total: 33000,
  tax_rate: 10,
  note: null,
  items_json: [
    { description: "請求書 INV-001", quantity: 1, unit_price: 22000, amount: 22000 },
    { description: "請求書 INV-002", quantity: 1, unit_price: 11000, amount: 11000 },
  ],
  is_invoice_compliant: false,
  show_seal: false,
  show_logo: false,
  show_bank_info: false,
  recipient_name: "山田 太郎",
} as DocForPdf;

const tenant: TenantForDocPdf = {
  name: "株式会社HOLY",
  address: null,
  contact_email: null,
  contact_phone: null,
  registration_number: null,
  logo_asset_path: null,
  company_seal_path: null,
  bank_info: null,
};

const sources = [
  {
    id: "inv-1",
    doc_type: "invoice",
    doc_number: "INV-001",
    issued_at: "2026-09-10",
    subject: "ボディコーティング",
    vehicle_info_json: { model: "プリウス", plate: "品川 300 あ 12-34" },
    items_json: [
      { item_type: "heading", description: "施工", quantity: 0, unit_price: 0, amount: 0 },
      { description: "ガラスコーティング施工", quantity: 1, unit_price: 20000, amount: 20000 },
    ],
    subtotal: 20000,
    tax: 2000,
    total: 22000,
    tax_rate: 10,
  },
  {
    id: "inv-2",
    doc_type: "invoice",
    doc_number: "INV-002",
    issued_at: "2026-09-20",
    subject: null,
    vehicle_info_json: {},
    items_json: [{ description: "オイル交換", quantity: 2, unit: "L", unit_price: 5000, amount: 10000 }],
    subtotal: 10000,
    tax: 1000,
    total: 11000,
    tax_rate: 10,
  },
] as unknown as ConsolidatedSource[];

// 圧縮ストリームの外に出る Page オブジェクトの数（/Type /Pages は除く）
const pageCount = (buf: Buffer) => (buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;

describe("renderDocumentPdf 合算内訳", () => {
  it("元帳票を渡すと内訳ページが追加される", async () => {
    const without = await renderDocumentPdf(doc, tenant, null);
    const withSources = await renderDocumentPdf(doc, tenant, null, undefined, sources);
    expect(withSources.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pageCount(without)).toBe(1);
    expect(pageCount(withSources)).toBe(2);
  }, 60_000);
});
