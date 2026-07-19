import { describe, it, expect } from "vitest";
import { parseVehicleMasterCsv } from "../vehicleMasterImport";

describe("parseVehicleMasterCsv", () => {
  it("computes size_class from dimensions (volume thresholds)", () => {
    const { rows, errors } = parseVehicleMasterCsv("トヨタ,ハイエース,4695,1695,1985");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        maker: "トヨタ",
        model: "ハイエース",
        size_class: "LL", // 4695*1695*1985/1e9 = 15.8㎥ → LL
        body_type: null,
        full_length_mm: 4695,
        full_width_mm: 1695,
        full_height_mm: 1985,
      },
    ]);
  });

  it("skips a header row (maker / メーカー)", () => {
    const csv = ["maker,model,full_length_mm,full_width_mm,full_height_mm", "スズキ,アルト,3395,1475,1525"].join("\n");
    const { rows } = parseVehicleMasterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ maker: "スズキ", model: "アルト", size_class: "SS" });
  });

  it("accepts an explicit size_class when dimensions are missing", () => {
    const { rows, errors } = parseVehicleMasterCsv("フェラーリ,SF90,,,,coupe,M");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ maker: "フェラーリ", model: "SF90", size_class: "M", body_type: "coupe" });
    expect(rows[0].full_length_mm).toBeNull();
  });

  it("errors a row that has neither full dimensions nor a size_class", () => {
    const { rows, errors } = parseVehicleMasterCsv("トヨタ,ノア,4695,1730");
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("寸法3つ");
  });

  it("errors rows missing maker or model", () => {
    const { rows, errors } = parseVehicleMasterCsv(",アルト,3395,1475,1525");
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("必須");
  });

  it("dedupes repeated (maker, model) within the file", () => {
    const csv = ["トヨタ,アクア,4050,1695,1485", "トヨタ,アクア,4050,1695,1485"].join("\n");
    const { rows, errors } = parseVehicleMasterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toContain("重複");
  });

  it("strips surrounding quotes and handles CRLF", () => {
    const csv = '"メルセデス・ベンツ","Aクラス",4420,1796,1440\r\n';
    const { rows } = parseVehicleMasterCsv(csv);
    expect(rows[0]).toMatchObject({ maker: "メルセデス・ベンツ", model: "Aクラス", size_class: "M" });
  });

  it("ignores an unknown explicit size_class value", () => {
    const { rows, errors } = parseVehicleMasterCsv("トヨタ,謎車,,,,,HUGE");
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
