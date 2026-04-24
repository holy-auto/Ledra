import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { RESOURCE_PDFS, SUPPORTED_PDF_LOCALES, isSupportedPdfLocale } from "../resourcePdf";

describe("RESOURCE_PDFS", () => {
  it("exposes the 6 homepage resources", () => {
    expect(Object.keys(RESOURCE_PDFS).sort()).toEqual(
      [
        "case-studies",
        "features-deep-dive",
        "pricing-overview",
        "roi-template",
        "security-whitepaper",
        "service-overview",
      ].sort(),
    );
  });

  it("every entry has a .pdf filename and a valid React Document factory", async () => {
    for (const [key, entry] of Object.entries(RESOURCE_PDFS)) {
      const filename = entry.filename({ locale: "ja" });
      expect(filename, `${key}.filename`).toMatch(/\.pdf$/);
      const doc = await entry.doc({ locale: "ja" });
      expect(isValidElement(doc), `${key}.doc() returns a React element`).toBe(true);
    }
  });

  it("ja is a supported locale; unknown locales are rejected by the guard", () => {
    expect(SUPPORTED_PDF_LOCALES).toContain("ja");
    expect(isSupportedPdfLocale("ja")).toBe(true);
    expect(isSupportedPdfLocale("en")).toBe(false);
    expect(isSupportedPdfLocale(null)).toBe(false);
    expect(isSupportedPdfLocale("")).toBe(false);
  });
});
