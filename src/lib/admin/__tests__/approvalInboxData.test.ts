import { describe, it, expect } from "vitest";
import { selectCertificateDraft } from "@/lib/admin/approvalInboxData";

describe("selectCertificateDraft", () => {
  it("picks the draft matching this certificate's own category out of a multi-category snapshot", () => {
    const snapshot = {
      draft: { confidence: 0.9, missingInfo: [] }, // primary (coating)
      drafts: [
        { category: "coating", draft: { confidence: 0.9, missingInfo: [] } },
        { category: "ppf", draft: { confidence: 0.4, missingInfo: ["フィルム型番"] } },
      ],
    };
    expect(selectCertificateDraft(snapshot, "ppf")).toEqual({ confidence: 0.4, missingInfo: ["フィルム型番"] });
    expect(selectCertificateDraft(snapshot, "coating")).toEqual({ confidence: 0.9, missingInfo: [] });
  });

  it("falls back to the top-level primary draft when there is no drafts[] (single-category snapshot)", () => {
    const snapshot = { draft: { confidence: 0.7, missingInfo: [] } };
    expect(selectCertificateDraft(snapshot, "coating")).toEqual({ confidence: 0.7, missingInfo: [] });
  });

  it("falls back to the primary draft when the service_type has no matching category", () => {
    const snapshot = {
      draft: { confidence: 0.9 },
      drafts: [{ category: "coating", draft: { confidence: 0.9 } }],
    };
    expect(selectCertificateDraft(snapshot, "unknown-category")).toEqual({ confidence: 0.9 });
  });

  it("returns undefined for a missing snapshot", () => {
    expect(selectCertificateDraft(null, "coating")).toBeUndefined();
    expect(selectCertificateDraft(undefined, null)).toBeUndefined();
  });
});
