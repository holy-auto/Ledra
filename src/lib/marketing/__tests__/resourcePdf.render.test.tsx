import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { RESOURCE_PDFS } from "../resourcePdf";

describe("RESOURCE_PDFS rendering", () => {
  it.each(Object.entries(RESOURCE_PDFS))(
    "renders %s to a non-empty PDF buffer",
    async (_key, entry) => {
      const doc = await entry.doc({ locale: "ja" });
      const buf = await renderToBuffer(doc);
      expect(buf.byteLength).toBeGreaterThan(1000);
      // PDF files start with %PDF-
      expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    },
    60_000,
  );
});
