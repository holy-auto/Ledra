// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomerSummaryPanel from "../CustomerSummaryPanel";
import type { DocumentRow } from "@/types/document";

function makeDoc(overrides: Partial<DocumentRow> & { id: string }): DocumentRow {
  return {
    tenant_id: "tenant-1",
    customer_id: null,
    customer_name: null,
    doc_type: "estimate",
    doc_number: "EST-0001",
    issued_at: "2026-06-01",
    due_date: null,
    status: "sent",
    subtotal: 0,
    tax: 0,
    total: 0,
    tax_rate: 10,
    items_json: [],
    note: null,
    meta_json: {},
    is_invoice_compliant: false,
    source_document_id: null,
    show_seal: false,
    show_logo: true,
    show_bank_info: false,
    recipient_name: null,
    recipient_honorific: "",
    recipient_postal_code: null,
    recipient_address: null,
    recipient_phone: null,
    subject: null,
    period_start: null,
    period_end: null,
    payment_terms: null,
    delivery_date: null,
    template_id: null,
    payment_date: null,
    vehicle_id: null,
    vehicle_info_json: {},
    created_at: "2026-06-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

const docs: DocumentRow[] = [
  makeDoc({
    id: "1",
    customer_id: "cust-a",
    customer_name: "顧客A",
    doc_type: "estimate",
    total: 1000,
    status: "sent",
  }),
  makeDoc({
    id: "2",
    customer_id: "cust-a",
    customer_name: "顧客A",
    doc_type: "estimate",
    total: 2000,
    status: "sent",
  }),
  // キャンセル済みは実質発生しなかった帳票として集計から除外されるべき
  makeDoc({
    id: "3",
    customer_id: "cust-a",
    customer_name: "顧客A",
    doc_type: "estimate",
    total: 9999,
    status: "cancelled",
  }),
  makeDoc({ id: "4", customer_id: "cust-b", customer_name: "顧客B", doc_type: "invoice", total: 5000, status: "paid" }),
];

describe("CustomerSummaryPanel", () => {
  it("renders nothing when there are no customer-linked documents", () => {
    const { container } = render(<CustomerSummaryPanel docs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a tab per customer plus an overview tab", () => {
    render(<CustomerSummaryPanel docs={docs} />);
    expect(screen.getByRole("button", { name: "すべて" })).toBeDefined();
    expect(screen.getByRole("button", { name: "顧客A" })).toBeDefined();
    expect(screen.getByRole("button", { name: "顧客B" })).toBeDefined();
  });

  it("excludes cancelled documents and switches the summary table when a customer tab is selected", () => {
    const { container } = render(<CustomerSummaryPanel docs={docs} />);
    const grandTotalCell = () => container.querySelector("tfoot td:nth-child(3)");
    const unpaidCell = () => container.querySelector("tfoot td:nth-child(4)");

    // 全体合計: 1000 + 2000 + 5000 = 8000（キャンセル分の9999は除外）
    expect(grandTotalCell()?.textContent).toBe("¥8,000");

    fireEvent.click(screen.getByRole("button", { name: "顧客A" }));
    expect(grandTotalCell()?.textContent).toBe("¥3,000");
    expect(unpaidCell()?.textContent).toBe("¥3,000"); // status=sent は未入金扱い

    fireEvent.click(screen.getByRole("button", { name: "顧客B" }));
    expect(grandTotalCell()?.textContent).toBe("¥5,000");
    expect(unpaidCell()?.textContent).toBe("-"); // status=paid は未入金なし
  });

  it("excludes draft documents from the aggregate total (not yet sent to the customer)", () => {
    const withDraft: DocumentRow[] = [
      ...docs,
      makeDoc({
        id: "5",
        customer_id: "cust-a",
        customer_name: "顧客A",
        doc_type: "estimate",
        total: 50000,
        status: "draft",
      }),
    ];
    const { container } = render(<CustomerSummaryPanel docs={withDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "顧客A" }));
    const grandTotalCell = () => container.querySelector("tfoot td:nth-child(3)");
    // 下書きの50000は未送付のため合計に含まれない（顧客Aの合計は引き続き3000のまま）
    expect(grandTotalCell()?.textContent).toBe("¥3,000");
  });

  it("falls back to the overview tab when the selected customer disappears from a narrower docs list", () => {
    const { container, rerender } = render(<CustomerSummaryPanel docs={docs} />);
    fireEvent.click(screen.getByRole("button", { name: "顧客A" }));
    const grandTotalCell = () => container.querySelector("tfoot td:nth-child(3)");
    expect(grandTotalCell()?.textContent).toBe("¥3,000");

    // 顧客Aの帳票が一覧フィルタ変更等で消えた状態を模す
    const withoutCustomerA = docs.filter((d) => d.customer_id !== "cust-a");
    rerender(<CustomerSummaryPanel docs={withoutCustomerA} />);

    // 「すべて」タブへ自動的に戻り、空表示のまま取り残されない
    expect(screen.getByRole("button", { name: "すべて" }).className).toContain("bg-accent-dim");
    expect(grandTotalCell()?.textContent).toBe("¥5,000");
  });

  it("shows a notice when the parent list filter narrows the docs passed in", () => {
    render(<CustomerSummaryPanel docs={docs} filterScopeLabel="請求書 / 入金済" />);
    expect(screen.getByText(/請求書 \/ 入金済/)).toBeDefined();
  });
});
