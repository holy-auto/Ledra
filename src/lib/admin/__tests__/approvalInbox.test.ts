import { describe, it, expect } from "vitest";
import { buildApprovalInbox } from "@/lib/admin/approvalInbox";

describe("buildApprovalInbox", () => {
  it("returns no sections when everything is empty", () => {
    const { sections, total } = buildApprovalInbox({ certificates: [], purchaseOrders: [], invoices: [] });
    expect(sections).toEqual([]);
    expect(total).toBe(0);
  });

  it("builds a certificate section with a one-tap issue action", () => {
    const { sections, total } = buildApprovalInbox({
      certificates: [{ public_id: "CERT-1", customer_name: "田中", service_type: "コーティング" }],
      purchaseOrders: [],
      invoices: [],
    });
    expect(total).toBe(1);
    const cert = sections.find((s) => s.key === "certificates");
    expect(cert?.count).toBe(1);
    expect(cert?.items[0]).toMatchObject({
      id: "CERT-1",
      title: "田中",
      subtitle: "コーティング",
      action: { kind: "issue_certificate", label: "発行" },
    });
  });

  it("builds a purchase-order section with a one-tap approve action and yen subtitle", () => {
    const { sections } = buildApprovalInbox({
      certificates: [],
      purchaseOrders: [{ id: "po-1", po_number: "PO-001", supplier_name: "ACME商事", subtotal: 24800 }],
      invoices: [],
    });
    const po = sections.find((s) => s.key === "purchase_orders");
    expect(po?.items[0]).toMatchObject({
      id: "po-1",
      title: "ACME商事",
      action: { kind: "approve_purchase_order", label: "承認" },
    });
    expect(po?.items[0].subtitle).toContain("PO-001");
    expect(po?.items[0].subtitle).toContain("¥24,800");
  });

  it("builds an invoice section WITHOUT a one-tap action (money-out stays 壁3)", () => {
    const { sections } = buildApprovalInbox({
      certificates: [],
      purchaseOrders: [],
      invoices: [{ id: "doc-1", doc_number: "INV-9", recipient_name: "山田", total: 5000 }],
    });
    const inv = sections.find((s) => s.key === "invoices");
    expect(inv?.count).toBe(1);
    expect(inv?.items[0].action).toBeUndefined();
    expect(inv?.items[0].href).toBe("/admin/invoices");
  });

  it("falls back to safe labels when names are missing", () => {
    const { sections } = buildApprovalInbox({
      certificates: [{ public_id: "C", customer_name: null, service_type: null }],
      purchaseOrders: [{ id: "p", po_number: null, supplier_name: null, subtotal: null }],
      invoices: [],
    });
    expect(sections.find((s) => s.key === "certificates")?.items[0].title).toBe("（顧客名なし）");
    expect(sections.find((s) => s.key === "purchase_orders")?.items[0].title).toBe("発注書");
  });

  it("orders sections certificates → purchase_orders → invoices and sums total", () => {
    const { sections, total } = buildApprovalInbox({
      certificates: [{ public_id: "C1" }, { public_id: "C2" }],
      purchaseOrders: [{ id: "p1" }],
      invoices: [{ id: "d1" }],
    });
    expect(sections.map((s) => s.key)).toEqual(["certificates", "purchase_orders", "invoices"]);
    expect(total).toBe(4);
  });
});
