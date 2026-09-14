import { describe, it, expect } from "vitest";
import { normalizeVin } from "../normalizeVin";

describe("normalizeVin", () => {
  it("uppercases lowercase characters", () => {
    expect(normalizeVin("jh4dc53001s000001")).toBe("JH4DC53001S000001");
  });

  it("strips ASCII hyphens, en-dashes, and full-width hyphens after NFKC", () => {
    // U+002D HYPHEN-MINUS, U+FF0D FULLWIDTH HYPHEN-MINUS
    expect(normalizeVin("JH4-DC5-3001-S000-001")).toBe("JH4DC53001S000001");
    expect(normalizeVin("JH4－DC5－3001")).toBe("JH4DC53001");
  });

  it("strips whitespace including tabs and newlines", () => {
    expect(normalizeVin(" JH4 DC5\t3001\nS000001 ")).toBe("JH4DC53001S000001");
  });

  it("converts full-width digits and letters via NFKC", () => {
    // FULLWIDTH J = U+FF2A, etc.
    expect(normalizeVin("ＪＨ４ＤＣ５")).toBe("JH4DC5");
  });

  it("strips a zero-width BOM", () => {
    // PostgreSQL's `\s` does not match U+FEFF, so the SQL rule in migration
    // 20260823000000 lists it explicitly to stay identical to this helper.
    expect(normalizeVin("JH4\uFEFFDC5")).toBe("JH4DC5");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeVin("  \t\n  ")).toBe("");
  });
});
