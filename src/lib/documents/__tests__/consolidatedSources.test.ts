import { describe, it, expect, vi } from "vitest";
import { consolidatedSourcesForPdf, loadConsolidatedSources } from "../consolidatedSources";
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

  it("turning the breakdown off hides it from the PDF only, not from the admin screen", async () => {
    const hidden = { doc_type: "consolidated_invoice", meta_json: { ...meta, show_consolidated_breakdown: false } };
    const pdfClient = fakeClient([{ id: "a" }, { id: "b" }]);
    expect(await consolidatedSourcesForPdf(pdfClient as never, "t1", hidden)).toEqual([]);
    expect(pdfClient.from).not.toHaveBeenCalled();
    const adminOut = await loadConsolidatedSources(fakeClient([{ id: "a" }, { id: "b" }]) as never, "t1", hidden);
    expect(adminOut.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("the PDF keeps the breakdown when the flag is unset (existing invoices)", async () => {
    const out = await consolidatedSourcesForPdf(fakeClient([{ id: "a" }, { id: "b" }]) as never, "t1", {
      doc_type: "consolidated_invoice",
      meta_json: meta,
    });
    expect(out.map((s) => s.id)).toEqual(["b", "a"]);
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
