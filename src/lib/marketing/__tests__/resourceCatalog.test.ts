import { describe, it, expect } from "vitest";
import { RESOURCE_CATALOG } from "../resourceCatalog";
import { RESOURCE_PDFS } from "../resourcePdf";

describe("RESOURCE_CATALOG", () => {
  it("every catalog key maps to a real generated PDF (no dead download links)", () => {
    for (const r of RESOURCE_CATALOG) {
      expect(RESOURCE_PDFS[r.key], `catalog key "${r.key}" missing from RESOURCE_PDFS`).toBeTruthy();
    }
  });

  it("covers every generated PDF so none is hidden from the portals", () => {
    const catalogKeys = new Set(RESOURCE_CATALOG.map((r) => r.key));
    for (const key of Object.keys(RESOURCE_PDFS)) {
      expect(catalogKeys.has(key), `RESOURCE_PDFS key "${key}" missing from RESOURCE_CATALOG`).toBe(true);
    }
  });

  it("each entry points at its own generated-PDF route", () => {
    for (const r of RESOURCE_CATALOG) {
      expect(r.downloadUrl).toBe(`/api/marketing/resources/${r.key}/pdf`);
    }
  });
});
