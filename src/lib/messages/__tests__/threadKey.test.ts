import { describe, it, expect } from "vitest";
import { parseThreadKey, customerThreadKey, lineThreadKey } from "@/lib/messages/threadKey";

describe("threadKey encode", () => {
  it("builds customer / line keys", () => {
    expect(customerThreadKey("abc")).toBe("c:abc");
    expect(lineThreadKey("U123")).toBe("l:U123");
  });
});

describe("parseThreadKey", () => {
  it("parses a customer thread", () => {
    expect(parseThreadKey("c:550e8400-e29b-41d4-a716-446655440000")).toEqual({
      kind: "customer",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("parses a line thread", () => {
    expect(parseThreadKey("l:U4af4980629...")).toEqual({ kind: "line", lineUserId: "U4af4980629..." });
  });

  it("round-trips encode → parse", () => {
    expect(parseThreadKey(customerThreadKey("cust-1"))).toEqual({ kind: "customer", customerId: "cust-1" });
    expect(parseThreadKey(lineThreadKey("Uxyz"))).toEqual({ kind: "line", lineUserId: "Uxyz" });
  });

  it("decodes URL-encoded keys", () => {
    // "c:" + encodeURIComponent not needed for uuid, but a line id could be encoded
    expect(parseThreadKey(encodeURIComponent("l:U a b"))).toEqual({ kind: "line", lineUserId: "U a b" });
  });

  it("rejects empty / prefix-only / unknown-prefix / non-string", () => {
    expect(parseThreadKey("")).toEqual({ kind: "invalid" });
    expect(parseThreadKey("c:")).toEqual({ kind: "invalid" });
    expect(parseThreadKey("l:")).toEqual({ kind: "invalid" });
    expect(parseThreadKey("x:foo")).toEqual({ kind: "invalid" });
    expect(parseThreadKey("nocolon")).toEqual({ kind: "invalid" });
    expect(parseThreadKey(undefined as unknown as string)).toEqual({ kind: "invalid" });
  });

  it("tolerates malformed percent sequences", () => {
    // decodeURIComponent throws on "%"; parser must not crash
    expect(parseThreadKey("c:100%")).toEqual({ kind: "customer", customerId: "100%" });
  });
});
