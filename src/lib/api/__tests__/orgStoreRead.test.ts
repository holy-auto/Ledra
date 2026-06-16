import { describe, it, expect } from "vitest";
import { parsePaging } from "../orgStoreRead";

const req = (qs: string) => new Request(`https://example.com/x${qs}`);

describe("parsePaging", () => {
  it("defaults to limit 50, offset 0", () => {
    expect(parsePaging(req(""))).toEqual({ limit: 50, offset: 0 });
  });

  it("clamps limit to the 1..200 range", () => {
    expect(parsePaging(req("?limit=500")).limit).toBe(200);
    expect(parsePaging(req("?limit=0")).limit).toBe(1);
    expect(parsePaging(req("?limit=-5")).limit).toBe(1);
  });

  it("parses valid limit/offset", () => {
    expect(parsePaging(req("?limit=25&offset=100"))).toEqual({ limit: 25, offset: 100 });
  });

  it("ignores negative or non-numeric offset", () => {
    expect(parsePaging(req("?offset=-10")).offset).toBe(0);
    expect(parsePaging(req("?offset=abc")).offset).toBe(0);
  });
});
