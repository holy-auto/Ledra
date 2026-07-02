import { describe, it, expect } from "vitest";
import { csvEscape, buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";

describe("csvEscape", () => {
  it("passes normal values through unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(123)).toBe("123");
    expect(csvEscape(null)).toBe("");
  });

  it("quotes values with commas/quotes/newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he "said"')).toBe('"he ""said"""');
  });

  it("neutralizes formula-injection leading chars", () => {
    // 先頭のシングルクォート前置で Excel の数式評価を無効化する。
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+cmd")).toBe("'+cmd");
    expect(csvEscape("-2")).toBe("'-2");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("quotes AND neutralizes when a formula also contains a comma", () => {
    expect(csvEscape("=1,2")).toBe('"\'=1,2"');
  });
});

describe("csvDownloadHeaders", () => {
  it("strips quotes/CRLF from filename to prevent header injection", () => {
    const h = csvDownloadHeaders('a"\r\nX-Evil: 1.csv');
    expect(h["content-disposition"]).toBe('attachment; filename="aX-Evil: 1.csv"');
  });
});

describe("buildCsv", () => {
  it("prepends BOM, uses CRLF, and escapes via csvEscape", () => {
    const out = buildCsv(["a", "b"], [["=x", "y"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("\r\n");
    expect(out).toContain("'=x");
  });
});
