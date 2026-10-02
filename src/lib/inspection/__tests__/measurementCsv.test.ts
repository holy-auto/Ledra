import { describe, it, expect } from "vitest";
import { parseMeasurementCsv } from "../measurementCsv";

describe("parseMeasurementCsv [G5 Phase 2 取込UI]", () => {
  it("numeric / judgment / text を値種別どおりに正規化し source=imported を付す", () => {
    const csv = [
      "field_code,value,unit", // ヘッダ（無視）
      "brake.total,8600,N",
      "co,0.5",
      "obd_result,良",
      "side_slip,IN 3,mm/m",
      "# コメント行は無視",
    ].join("\n");
    const { rows, issues } = parseMeasurementCsv(csv, "sanago");
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { field_code: "brake.total", num_value: 8600, unit: "N", source: "imported" },
      { field_code: "co", num_value: 0.5, unit: "%", source: "imported" }, // unit 省略→カタログ既定
      { field_code: "obd_result", judgment: "pass", source: "imported" },
      { field_code: "side_slip", text_value: "IN 3", unit: "mm/m", source: "imported" },
    ]);
  });

  it("未知コード・様式外・数値不可・重複・空値を issues に落とし rows に含めない", () => {
    const csv = [
      "bogus.code,1", // 未知
      "brake.front,100,N", // yonago 専用 → sanago では様式外
      "co,abc", // 数値不可
      "hc,100", // OK
      "hc,200", // 重複
      "diesel_smoke,", // 空値
    ].join("\n");
    const { rows, issues } = parseMeasurementCsv(csv, "sanago");
    expect(rows).toEqual([{ field_code: "hc", num_value: 100, unit: "ppm", source: "imported" }]);
    const reasons = issues.map((i) => `${i.code}:${i.reason}`);
    expect(reasons).toContain("bogus.code:未知の測定項目コード");
    expect(reasons).toContain("brake.front:この様式に無い項目");
    expect(reasons).toContain("co:数値に変換できない");
    expect(reasons).toContain("hc:重複行");
    expect(reasons).toContain("diesel_smoke:値が空");
  });

  it("単位不正・非十進数（hex/指数）を除外し、プレビューとサーバ検証を一致させる", () => {
    const csv = [
      "co,0.5,ppm", // co は % のみ → 単位不正
      "hc,0x20", // 16進は非十進 → 数値に変換できない
      "brake.total,1e3,N", // 指数表記も除外
      "brake.total,8600,N", // これだけ有効
    ].join("\n");
    const { rows, issues } = parseMeasurementCsv(csv, "sanago");
    expect(rows).toEqual([{ field_code: "brake.total", num_value: 8600, unit: "N", source: "imported" }]);
    const reasons = issues.map((i) => i.reason);
    expect(reasons.some((r) => r.startsWith("単位が不正"))).toBe(true);
    // hex(0x20) と指数(1e3) の両方が非十進として弾かれる
    expect(issues.filter((i) => i.reason === "数値に変換できない")).toHaveLength(2);
  });

  it("BOM・先頭空行の後のヘッダ行も data として拾わずスキップする", () => {
    const csv = ["﻿", "field_code,value,unit", "co,0.5"].join("\n");
    const { rows, issues } = parseMeasurementCsv(csv, "sanago");
    expect(issues).toEqual([]);
    expect(rows).toEqual([{ field_code: "co", num_value: 0.5, unit: "%", source: "imported" }]);
  });
});
