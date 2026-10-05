// @vitest-environment jsdom
/**
 * 合算請求書の詳細で、元帳票ごとの明細（合算内訳）が表示されることを確認する。
 * 合算請求書自体の明細は「元帳票1件=1行（合計額のみ）」なので、内訳が無いと何の請求か分からない。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentDetailClient from "../DocumentDetailClient";
import type { ConsolidatedSource } from "@/lib/documents/consolidatedSources";
import type { DocumentRow } from "@/types/document";

const doc = {
  id: "cinv-1",
  doc_type: "consolidated_invoice",
  doc_number: "CINV-001",
  status: "draft",
  issued_at: "2026-10-01",
  subtotal: 30000,
  tax: 3000,
  total: 33000,
  tax_rate: 10,
  items_json: [],
  meta_json: {},
  is_invoice_compliant: false,
  show_logo: false,
  show_seal: false,
  show_bank_info: false,
  source_document_id: "inv-1",
} as unknown as DocumentRow;

const sources = [
  {
    id: "inv-1",
    doc_type: "invoice",
    doc_number: "INV-001",
    issued_at: "2026-09-10",
    subject: "ボディコーティング",
    vehicle_info_json: { model: "プリウス", plate: "品川 300 あ 12-34" },
    items_json: [{ description: "ガラスコーティング施工", quantity: 1, unit_price: 20000, amount: 20000 }],
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

describe("DocumentDetailClient 合算内訳", () => {
  it("元帳票ごとの番号・明細・リンクを表示する", () => {
    render(<DocumentDetailClient document={doc} customerName={null} tenant={null} consolidatedSources={sources} />);
    expect(screen.getByText("合算内訳（2件）")).toBeDefined();
    expect(screen.getByText("ガラスコーティング施工")).toBeDefined();
    expect(screen.getByText("オイル交換")).toBeDefined();
    expect(screen.getByText("車両: プリウス 品川 300 あ 12-34")).toBeDefined();
    expect(screen.getByText("請求書 INV-002").getAttribute("href")).toBe("/admin/documents/inv-2");
    // 内訳に全件のリンクがあるので、先頭1件だけを指す「元帳票」リンクは出さない
    expect(screen.queryByText("元帳票:")).toBeNull();
  });

  it("内訳が無ければセクションを出さない", () => {
    render(<DocumentDetailClient document={doc} customerName={null} tenant={null} />);
    expect(screen.queryByText(/合算内訳/)).toBeNull();
  });
});
