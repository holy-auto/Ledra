import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv/parse";

describe("parseCsv", () => {
  it("parses header + rows", () => {
    const r = parseCsv(`name,age\nAlice,30\nBob,40\n`);
    expect(r.header).toEqual(["name", "age"]);
    expect(r.rows).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "40" },
    ]);
  });

  it("handles quoted fields with commas and newlines", () => {
    const r = parseCsv('name,note\n"Alice, A","line1\nline2"\n');
    expect(r.rows).toEqual([{ name: "Alice, A", note: "line1\nline2" }]);
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const r = parseCsv('name,note\n"He said ""hi""",x\n');
    expect(r.rows[0].note).toBe("x");
    expect(r.rows[0].name).toBe('He said "hi"');
  });

  it("strips BOM", () => {
    const r = parseCsv("﻿a,b\n1,2\n");
    expect(r.header).toEqual(["a", "b"]);
    expect(r.rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("supports CRLF line endings", () => {
    const r = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(r.rows.length).toBe(2);
  });

  it("trims fields by default", () => {
    const r = parseCsv("a,b\n  hi  , there \n");
    expect(r.rows[0]).toEqual({ a: "hi", b: "there" });
  });

  it("respects maxRows guard", () => {
    expect(() => parseCsv("a\n1\n2\n3\n", { maxRows: 2 })).toThrow(/csv_too_many_rows/);
  });

  it("rejects oversized source before parsing (byte cap)", () => {
    expect(() => parseCsv("aaaaaaaaaa", { maxBytes: 5 })).toThrow(/csv_too_many_rows/);
  });
});
