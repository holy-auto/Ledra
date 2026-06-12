import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

vi.mock("@/lib/pdfDocument", () => ({
  renderDocumentPdf: vi.fn(
    async (doc: { doc_number?: string }) => new Uint8Array(Buffer.from(`PDF:${doc.doc_number ?? "x"}`)),
  ),
}));

vi.mock("@/types/documentTemplate", () => ({
  layoutConfigSchema: { safeParse: () => ({ success: false }) },
}));

// In-memory tables the chainable query stub reads from.
const tables: {
  tenants: unknown[];
  documents: Array<{
    id: string;
    doc_number: string | null;
    doc_type: string;
    customer_id: string | null;
    template_id: string | null;
  }>;
  customers: Array<{ id: string; name: string | null }>;
  document_templates: unknown[];
} = {
  tenants: [{ id: "t1", name: "Shop", default_template_id: null }],
  documents: [],
  customers: [],
  document_templates: [],
};

function makeQuery(rows: unknown[]) {
  let result = [...rows];
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.in = vi.fn((_col: string, ids: string[]) => {
    result = result.filter((r) => ids.includes((r as { id: string }).id));
    return q;
  });
  q.limit = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: result[0] ?? null, error: null }));
  q.single = vi.fn(async () => ({ data: result[0] ?? null, error: null }));
  q.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: result, error: null });
  return q;
}

const fromSpy = vi.fn((table: keyof typeof tables) => makeQuery(tables[table]));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: { from: fromSpy }, tenantId: "t1" }),
}));

// Minimal JSZip stub that records files and returns a deterministic buffer.
const zipFiles: Record<string, Uint8Array> = {};
vi.mock("jszip", () => {
  return {
    default: class {
      file(name: string, data: Uint8Array) {
        zipFiles[name] = data;
      }
      async generateAsync() {
        return Buffer.from(`ZIP:${Object.keys(zipFiles).join(",")}`);
      }
    },
  };
});

import { renderTenantDocumentPdfs, generateBatchDocumentZip } from "@/lib/pdf/batchDocumentPdf";

beforeEach(() => {
  fromSpy.mockClear();
  for (const k of Object.keys(zipFiles)) delete zipFiles[k];
  tables.documents = [
    { id: "d1", doc_number: "INV-001", doc_type: "invoice", customer_id: "c1", template_id: null },
    { id: "d2", doc_number: "INV-002", doc_type: "estimate", customer_id: null, template_id: null },
  ];
  tables.customers = [{ id: "c1", name: "山田太郎" }];
});

describe("renderTenantDocumentPdfs", () => {
  it("returns empty for empty input without querying", async () => {
    const r = await renderTenantDocumentPdfs([], "t1");
    expect(r).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("renders requested documents in order with doc_number filenames", async () => {
    const r = await renderTenantDocumentPdfs(["d2", "d1"], "t1");
    expect(r.map((x) => x.filename)).toEqual(["INV-002.pdf", "INV-001.pdf"]);
    expect(Buffer.from(r[1].data).toString()).toBe("PDF:INV-001");
  });

  it("skips ids that do not belong to the tenant", async () => {
    const r = await renderTenantDocumentPdfs(["d1", "nope"], "t1");
    expect(r.map((x) => x.filename)).toEqual(["INV-001.pdf"]);
  });

  it("de-duplicates colliding doc_number filenames", async () => {
    tables.documents = [
      { id: "d1", doc_number: "DUP", doc_type: "invoice", customer_id: null, template_id: null },
      { id: "d2", doc_number: "DUP", doc_type: "invoice", customer_id: null, template_id: null },
    ];
    const r = await renderTenantDocumentPdfs(["d1", "d2"], "t1");
    expect(r.map((x) => x.filename)).toEqual(["DUP.pdf", "DUP (2).pdf"]);
  });

  it("sanitizes unsafe characters in doc_number", async () => {
    tables.documents = [{ id: "d1", doc_number: "A/B:C", doc_type: "invoice", customer_id: null, template_id: null }];
    const r = await renderTenantDocumentPdfs(["d1"], "t1");
    expect(r[0].filename).toBe("A_B_C.pdf");
  });
});

describe("generateBatchDocumentZip", () => {
  it("bundles rendered PDFs into a zip", async () => {
    const out = await generateBatchDocumentZip(["d1", "d2"], "t1");
    expect(Buffer.from(out).toString()).toContain("INV-001.pdf");
    expect(Buffer.from(out).toString()).toContain("INV-002.pdf");
  });

  it("throws no_documents when nothing renders", async () => {
    await expect(generateBatchDocumentZip(["nope"], "t1")).rejects.toThrow(/no_documents/);
  });
});
