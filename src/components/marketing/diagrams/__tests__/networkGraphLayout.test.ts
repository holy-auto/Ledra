import { describe, it, expect } from "vitest";
import { fanPositions, satelliteList, buildSatellites } from "../networkGraphLayout";

describe("fanPositions", () => {
  it("returns [] for count <= 0", () => {
    expect(fanPositions(0, 0, 100, 0, 0, 90)).toEqual([]);
    expect(fanPositions(0, 0, 100, -1, 0, 90)).toEqual([]);
  });

  it("places a single point at the midpoint angle", () => {
    const [p] = fanPositions(0, 0, 100, 1, 0, 90);
    expect(p.x).toBeCloseTo(100 * Math.cos((45 * Math.PI) / 180));
    expect(p.y).toBeCloseTo(100 * Math.sin((45 * Math.PI) / 180));
  });

  it("evenly spaces N points across the arc, including both endpoints", () => {
    const points = fanPositions(0, 0, 100, 3, 0, 180);
    expect(points).toHaveLength(3);
    // first point on the 0deg endpoint, last on the 180deg endpoint
    expect(points[0].x).toBeCloseTo(100);
    expect(points[0].y).toBeCloseTo(0);
    expect(points[2].x).toBeCloseTo(-100);
    expect(points[2].y).toBeCloseTo(0, 5);
  });
});

describe("satelliteList", () => {
  const entries = Array.from({ length: 8 }, (_, i) => ({ label: `n${i}`, count: i + 1 }));

  it("returns entries unchanged when under the cap", () => {
    expect(satelliteList(entries.slice(0, 3), 6)).toEqual(entries.slice(0, 3));
  });

  it("returns entries unchanged when exactly at the cap", () => {
    expect(satelliteList(entries.slice(0, 6), 6)).toEqual(entries.slice(0, 6));
  });

  it("folds the remainder into one '+N件' node summing their counts", () => {
    const result = satelliteList(entries, 6);
    expect(result).toHaveLength(6);
    expect(result.slice(0, 5)).toEqual(entries.slice(0, 5));
    // remaining 3 entries (counts 6,7,8) folded into one node
    expect(result[5]).toEqual({ label: "+3件", count: 6 + 7 + 8 });
  });
});

describe("buildSatellites", () => {
  it("keeps points and entries in sync even after truncation (regression: no zip-by-index drift)", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ label: `n${i}`, count: 1 }));
    const sats = buildSatellites(entries, { x: 0, y: 0 }, 100, 0, 180, 4);
    expect(sats).toHaveLength(4);
    expect(sats.every((s) => typeof s.point.x === "number" && typeof s.point.y === "number")).toBe(true);
    expect(sats[3].label).toBe("+7件");
  });

  it("returns [] for no entries", () => {
    expect(buildSatellites([], { x: 0, y: 0 }, 100, 0, 180, 4)).toEqual([]);
  });
});
