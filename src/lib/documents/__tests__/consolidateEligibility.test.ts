import { describe, it, expect } from "vitest";
import { isConsolidatableDoc, canConsolidateDocuments } from "../consolidateEligibility";
import type { DocType, DocumentStatus } from "@/types/document";

function doc(overrides: { doc_type: DocType; status: DocumentStatus; customer_id: string | null }) {
  return overrides;
}

describe("isConsolidatableDoc", () => {
  it("accepts delivery/invoice docs with a customer that are not cancelled/rejected", () => {
    expect(isConsolidatableDoc(doc({ doc_type: "delivery", status: "sent", customer_id: "c1" }))).toBe(true);
    expect(isConsolidatableDoc(doc({ doc_type: "invoice", status: "draft", customer_id: "c1" }))).toBe(true);
  });

  it("rejects doc types other than delivery/invoice", () => {
    expect(isConsolidatableDoc(doc({ doc_type: "estimate", status: "sent", customer_id: "c1" }))).toBe(false);
    expect(isConsolidatableDoc(doc({ doc_type: "receipt", status: "paid", customer_id: "c1" }))).toBe(false);
  });

  it("rejects docs without a customer", () => {
    expect(isConsolidatableDoc(doc({ doc_type: "invoice", status: "sent", customer_id: null }))).toBe(false);
  });

  it("rejects cancelled/rejected docs", () => {
    expect(isConsolidatableDoc(doc({ doc_type: "invoice", status: "cancelled", customer_id: "c1" }))).toBe(false);
    expect(isConsolidatableDoc(doc({ doc_type: "invoice", status: "rejected", customer_id: "c1" }))).toBe(false);
  });
});

describe("canConsolidateDocuments", () => {
  it("requires at least 2 documents", () => {
    const result = canConsolidateDocuments([doc({ doc_type: "invoice", status: "sent", customer_id: "c1" })]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/2件以上/);
  });

  it("requires all selected documents to belong to the same customer", () => {
    const result = canConsolidateDocuments([
      doc({ doc_type: "invoice", status: "sent", customer_id: "c1" }),
      doc({ doc_type: "invoice", status: "sent", customer_id: "c2" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/同じ顧客/);
  });

  it("rejects when any selected document is not consolidatable (e.g. an estimate)", () => {
    const result = canConsolidateDocuments([
      doc({ doc_type: "invoice", status: "sent", customer_id: "c1" }),
      doc({ doc_type: "estimate", status: "sent", customer_id: "c1" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/納品書・請求書/);
  });

  it("allows 2+ delivery/invoice documents for the same customer", () => {
    const result = canConsolidateDocuments([
      doc({ doc_type: "delivery", status: "sent", customer_id: "c1" }),
      doc({ doc_type: "invoice", status: "sent", customer_id: "c1" }),
    ]);
    expect(result).toEqual({ ok: true });
  });
});
