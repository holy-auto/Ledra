import { describe, it, expect } from "vitest";
import { groupEdges, extractEmbeddedName, toNetworkStatItems, type NetworkStats } from "../network";

describe("extractEmbeddedName", () => {
  it("reads name from an object-shaped embed", () => {
    expect(extractEmbeddedName({ name: "Acme" })).toBe("Acme");
  });

  it("reads name from an array-shaped embed (PostgREST to-one quirk)", () => {
    expect(extractEmbeddedName([{ name: "Acme" }])).toBe("Acme");
  });

  it("returns undefined for null/empty/missing name", () => {
    expect(extractEmbeddedName(null)).toBeUndefined();
    expect(extractEmbeddedName([])).toBeUndefined();
    expect(extractEmbeddedName({})).toBeUndefined();
  });
});

describe("groupEdges", () => {
  it("counts and sorts by edge count descending", () => {
    const rows = [
      { manufacturer_id: "a", manufacturers: { name: "A社" } },
      { manufacturer_id: "b", manufacturers: { name: "B社" } },
      { manufacturer_id: "a", manufacturers: { name: "A社" } },
      { manufacturer_id: "a", manufacturers: { name: "A社" } },
    ];
    const result = groupEdges(rows, "manufacturer_id", (r) => extractEmbeddedName(r.manufacturers));
    expect(result).toEqual([
      { id: "a", name: "A社", shopCount: 3 },
      { id: "b", name: "B社", shopCount: 1 },
    ]);
  });

  it("returns [] for null rows (query failure)", () => {
    expect(groupEdges(null, "manufacturer_id", () => undefined)).toEqual([]);
  });

  it("skips rows with a non-string id and falls back to ― for a missing name", () => {
    const rows = [
      { manufacturer_id: 123, manufacturers: { name: "ignored" } },
      { manufacturer_id: "a", manufacturers: null },
    ];
    const result = groupEdges(rows, "manufacturer_id", (r) => extractEmbeddedName(r.manufacturers));
    expect(result).toEqual([{ id: "a", name: "―", shopCount: 1 }]);
  });
});

describe("toNetworkStatItems", () => {
  it("maps every NetworkStats field to exactly one stat item", () => {
    const stats: NetworkStats = {
      certificateCount: 10,
      shopCount: 5,
      manufacturerCount: 3,
      insurerCount: 2,
      customerCount: 100,
      accountCount: 20,
      manufacturers: [],
      insurers: [],
      regions: [],
      isLive: true,
      fetchedAt: new Date().toISOString(),
    };
    const items = toNetworkStatItems(stats);
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.value)).toEqual([10, 5, 3, 2, 100, 20]);
  });
});
