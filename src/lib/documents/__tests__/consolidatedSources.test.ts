import { describe, it, expect, vi } from "vitest";
import { loadConsolidatedSources } from "../consolidatedSources";
import { isDocumentDeletable } from "@/types/document";

function fakeClient(rows: { id: string }[]) {
  const chain = { select: () => chain, in: () => chain, eq: async () => ({ data: rows, error: null }) };
  return { from: vi.fn(() => chain) };
}

describe("loadConsolidatedSources", () => {
  const meta = { source_document_ids: ["b", "a"] };

  it("returns sources in consolidation order when the breakdown is shown (default)", async () => {
    const client = fakeClient([{ id: "a" }, { id: "b" }]);
    const out = await loadConsolidatedSources(client as never, "t1", {
      doc_type: "consolidated_invoice",
      meta_json: meta,
    });
    expect(out.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("returns nothing when the breakdown was turned off at creation", async () => {
    const client = fakeClient([{ id: "a" }, { id: "b" }]);
    const out = await loadConsolidatedSources(client as never, "t1", {
      doc_type: "consolidated_invoice",
      meta_json: { ...meta, show_consolidated_breakdown: false },
    });
    expect(out).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("isDocumentDeletable for consolidated invoices", () => {
  it("allows deleting sent/overdue/cancelled consolidated invoices but not paid ones", () => {
    expect(isDocumentDeletable("consolidated_invoice", "sent")).toBe(true);
    expect(isDocumentDeletable("consolidated_invoice", "overdue")).toBe(true);
    expect(isDocumentDeletable("consolidated_invoice", "cancelled")).toBe(true);
    expect(isDocumentDeletable("consolidated_invoice", "paid")).toBe(false);
    // 通常の請求書は従来どおり下書きのみ
    expect(isDocumentDeletable("invoice", "sent")).toBe(false);
  });
});
