import { describe, it, expect } from "vitest";
import { makePublicId } from "../publicId";

describe("makePublicId", () => {
  it("returns string of default length 22", () => {
    const id = makePublicId();
    expect(id).toHaveLength(22);
  });

  it("returns string of custom length", () => {
    expect(makePublicId(10)).toHaveLength(10);
    expect(makePublicId(32)).toHaveLength(32);
  });

  it("uses only URL-safe characters", () => {
    const id = makePublicId(100);
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("generates unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => makePublicId()));
    expect(ids.size).toBe(100);
  });

  it("handles edge case of length 1", () => {
    const id = makePublicId(1);
    expect(id).toHaveLength(1);
    expect(id).toMatch(/^[a-zA-Z0-9_-]$/);
  });
});
