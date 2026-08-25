import { describe, it, expect } from "vitest";
import { parseMileageKm, MAX_MILEAGE_KM } from "../mileage";

describe("parseMileageKm", () => {
  it("accepts a plain reading", () => {
    expect(parseMileageKm("35000")).toBe(35000);
    expect(parseMileageKm(35000)).toBe(35000);
    expect(parseMileageKm(" 35000 ")).toBe(35000);
  });

  it("rejects what the DB trigger would silently drop", () => {
    // fn_sync_mileage_from_certificate ignores null and <= 0, so the form must
    // not accept them — otherwise the entry vanishes with no error.
    expect(parseMileageKm("")).toBeNull();
    expect(parseMileageKm(null)).toBeNull();
    expect(parseMileageKm(undefined)).toBeNull();
    expect(parseMileageKm("0")).toBeNull();
    expect(parseMileageKm("-1")).toBeNull();
  });

  it("rejects non-integers and stray units", () => {
    expect(parseMileageKm("abc")).toBeNull();
    expect(parseMileageKm("35000km")).toBeNull();
    expect(parseMileageKm("35.5")).toBeNull();
  });

  it("rejects an extra-digit typo but keeps a high-mileage car", () => {
    expect(parseMileageKm(String(MAX_MILEAGE_KM))).toBe(MAX_MILEAGE_KM);
    expect(parseMileageKm(String(MAX_MILEAGE_KM + 1))).toBeNull();
    expect(parseMileageKm("350000")).toBe(350000);
  });
});
