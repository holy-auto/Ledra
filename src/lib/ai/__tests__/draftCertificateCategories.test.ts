import { describe, it, expect } from "vitest";
import { CERTIFICATE_CATEGORIES, certificateCategoryLabel } from "../draftCertificate";

describe("certificate categories", () => {
  it("exposes the canonical large categories", () => {
    expect(CERTIFICATE_CATEGORIES).toContain("coating");
    expect(CERTIFICATE_CATEGORIES).toContain("ppf");
    expect(CERTIFICATE_CATEGORIES).toContain("body_repair");
    expect(CERTIFICATE_CATEGORIES).toContain("general");
    // 重複が無いこと
    expect(new Set(CERTIFICATE_CATEGORIES).size).toBe(CERTIFICATE_CATEGORIES.length);
  });

  it("maps every category to a Japanese label", () => {
    for (const c of CERTIFICATE_CATEGORIES) {
      const label = certificateCategoryLabel(c);
      expect(label).toBeTruthy();
      expect(label).not.toBe(c); // ラベルはコードと別 (日本語)
    }
  });

  it("returns the raw value for unknown categories", () => {
    expect(certificateCategoryLabel("unknown_xyz")).toBe("unknown_xyz");
  });
});
