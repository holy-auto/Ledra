import { describe, it, expect } from "vitest";
import { manualProtectedCodes } from "../measurementMerge";

describe("manualProtectedCodes [G5 Phase 2 取込マージ]", () => {
  it("source='manual' のセルのみを保護集合として返す（imported/未登録は含めない）", () => {
    const set = manualProtectedCodes([
      { field_code: "brake.total", source: "manual" },
      { field_code: "co", source: "imported" },
      { field_code: "hc", source: null },
    ]);
    expect([...set]).toEqual(["brake.total"]);
  });

  it("既存が空なら保護対象なし（取込は全件 upsert 可）", () => {
    expect(manualProtectedCodes([]).size).toBe(0);
  });

  it("取込時の分離: 保護コードは skip、それ以外（再取込 imported・新規）は upsert 対象", () => {
    const protectedCodes = manualProtectedCodes([
      { field_code: "brake.total", source: "manual" },
      { field_code: "co", source: "imported" },
    ]);
    const payload = ["brake.total", "co", "hc"];
    const skipped = payload.filter((c) => protectedCodes.has(c));
    const importable = payload.filter((c) => !protectedCodes.has(c));
    expect(skipped).toEqual(["brake.total"]);
    expect(importable).toEqual(["co", "hc"]);
  });
});
