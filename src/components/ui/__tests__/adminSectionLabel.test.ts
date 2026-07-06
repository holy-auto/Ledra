import { describe, it, expect } from "vitest";
import { ADMIN_NAV_LABELS, adminSectionLabel } from "@/components/ui/Sidebar";

describe("adminSectionLabel", () => {
  it("resolves a known section from its exact path", () => {
    expect(adminSectionLabel("/admin/certificates")).toBe(ADMIN_NAV_LABELS["/admin/certificates"]);
  });

  it("resolves the section for a nested detail route (prefix match)", () => {
    // /admin/certificates/123 → 証明書一覧のラベルに解決される
    expect(adminSectionLabel("/admin/certificates/abc123")).toBe(ADMIN_NAV_LABELS["/admin/certificates"]);
  });

  it("prefers the longest matching prefix, not a shorter sibling", () => {
    // より深い href が登録されていれば、そちらのラベルを優先する。
    const entries = Object.keys(ADMIN_NAV_LABELS);
    const nested = entries.find((h) => entries.some((o) => o !== h && h.startsWith(o + "/")));
    if (nested) {
      expect(adminSectionLabel(nested)).toBe(ADMIN_NAV_LABELS[nested]);
    }
  });

  it("returns undefined for the /admin root and unknown routes", () => {
    expect(adminSectionLabel("/admin")).toBeUndefined();
    expect(adminSectionLabel("/admin/totally-unknown-xyz")).toBeUndefined();
  });
});
