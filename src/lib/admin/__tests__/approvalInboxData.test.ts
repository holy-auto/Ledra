import { describe, it, expect } from "vitest";
import { selectCertificateDraft, canSeePurchaseOrders } from "@/lib/admin/approvalInboxData";

describe("selectCertificateDraft", () => {
  it("picks the draft matching this certificate's own category out of a multi-category snapshot", () => {
    const snapshot = {
      draft: { confidence: 0.9, missingInfo: [] }, // primary (coating)
      drafts: [
        { category: "coating", draft: { confidence: 0.9, missingInfo: [] } },
        { category: "ppf", draft: { confidence: 0.4, missingInfo: ["フィルム型番"] } },
      ],
    };
    expect(selectCertificateDraft(snapshot, "ppf", true)).toEqual({ confidence: 0.4, missingInfo: ["フィルム型番"] });
    expect(selectCertificateDraft(snapshot, "coating", true)).toEqual({ confidence: 0.9, missingInfo: [] });
  });

  it("falls back to the top-level primary draft when there is no drafts[] (single-category snapshot)", () => {
    const snapshot = { draft: { confidence: 0.7, missingInfo: [] } };
    expect(selectCertificateDraft(snapshot, "coating", true)).toEqual({ confidence: 0.7, missingInfo: [] });
  });

  it("falls back to the primary draft when the service_type has no matching category", () => {
    const snapshot = {
      draft: { confidence: 0.9 },
      drafts: [{ category: "coating", draft: { confidence: 0.9 } }],
    };
    expect(selectCertificateDraft(snapshot, "unknown-category", true)).toEqual({ confidence: 0.9 });
  });

  it("returns undefined for a missing snapshot", () => {
    expect(selectCertificateDraft(null, "coating", true)).toBeUndefined();
    expect(selectCertificateDraft(undefined, null, true)).toBeUndefined();
  });

  it("never shows why for a manually created certificate, even if the reservation has an AI draft", () => {
    const snapshot = { draft: { confidence: 0.95, missingInfo: [] } };
    expect(selectCertificateDraft(snapshot, "coating", false)).toBeUndefined();
  });
});

describe("canSeePurchaseOrders", () => {
  it("allows roles with menu_items:manage (owner/admin/super_admin)", () => {
    expect(canSeePurchaseOrders("owner")).toBe(true);
    expect(canSeePurchaseOrders("admin")).toBe(true);
    expect(canSeePurchaseOrders("super_admin")).toBe(true);
  });

  it("denies staff and viewer, which have dashboard:view but not menu_items:manage", () => {
    expect(canSeePurchaseOrders("staff")).toBe(false);
    expect(canSeePurchaseOrders("viewer")).toBe(false);
  });

  it("allows when role is omitted (back-compat for callers that don't pass one)", () => {
    expect(canSeePurchaseOrders(undefined)).toBe(true);
  });
});
