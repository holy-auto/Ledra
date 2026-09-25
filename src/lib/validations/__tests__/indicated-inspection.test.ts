import { describe, it, expect } from "vitest";
import {
  measurementInputSchema,
  measurementsPutSchema,
  measurementFieldsForForm,
  isKnownMeasurementCode,
  MEASUREMENT_FIELDS,
} from "../indicated-inspection";

describe("indicated-inspection measurement catalog", () => {
  it("既知/未知の field_code を判定する", () => {
    expect(isKnownMeasurementCode("brake.total")).toBe(true);
    expect(isKnownMeasurementCode("co")).toBe(true);
    expect(isKnownMeasurementCode("does.not.exist")).toBe(false);
  });

  it("各様式に固有のセルがある（包含関係ではない）", () => {
    const sanago = new Set(measurementFieldsForForm("sanago").map((f) => f.code));
    const yonago = new Set(measurementFieldsForForm("yonago").map((f) => f.code));
    // 四輪固有（軸ごと左右の制動力・駐車制動・サイドスリップ・OBD・黒煙）は二輪に無い
    for (const code of ["brake.front_front.right", "brake.parking.right", "side_slip", "obd_result", "diesel_smoke"]) {
      expect(sanago.has(code)).toBe(true);
      expect(yonago.has(code)).toBe(false);
    }
    // 二輪固有（前軸/後軸の集約制動力）は四輪に無い → 包含関係ではない
    for (const code of ["brake.front", "brake.rear"]) {
      expect(yonago.has(code)).toBe(true);
      expect(sanago.has(code)).toBe(false);
    }
    // 共通項目は両様式にある
    expect(yonago.has("co")).toBe(true);
    expect(sanago.has("co")).toBe(true);
  });

  it("未知の field_code は拒否する", () => {
    const r = measurementInputSchema.safeParse({ field_code: "bogus", num_value: 1 });
    expect(r.success).toBe(false);
  });

  it("単位はその項目の許容単位に限定する（CO は % のみ）", () => {
    expect(measurementInputSchema.safeParse({ field_code: "co", num_value: 0.5, unit: "%" }).success).toBe(true);
    expect(measurementInputSchema.safeParse({ field_code: "co", num_value: 0.5, unit: "kg" }).success).toBe(false);
    // 制動力は N / kg どちらも可
    expect(measurementInputSchema.safeParse({ field_code: "brake.total", num_value: 1000, unit: "N" }).success).toBe(
      true,
    );
    expect(measurementInputSchema.safeParse({ field_code: "brake.total", num_value: 100, unit: "kg" }).success).toBe(
      true,
    );
  });

  it("値種別の整合: numeric は数値必須 / judgment は判定必須", () => {
    expect(measurementInputSchema.safeParse({ field_code: "co" }).success).toBe(false); // 数値なし
    expect(measurementInputSchema.safeParse({ field_code: "co", num_value: 0.3 }).success).toBe(true);
    expect(measurementInputSchema.safeParse({ field_code: "obd_result" }).success).toBe(false); // 判定なし
    expect(measurementInputSchema.safeParse({ field_code: "obd_result", judgment: "pass" }).success).toBe(true);
  });

  it("値が一切無い空の測定値は拒否する（text 項目も含む）", () => {
    expect(measurementInputSchema.safeParse({ field_code: "side_slip" }).success).toBe(false); // 空
    expect(measurementInputSchema.safeParse({ field_code: "side_slip", text_value: "イン 2" }).success).toBe(true);
    expect(measurementInputSchema.safeParse({ field_code: "headlight.aim.right", text_value: "適合" }).success).toBe(
      true,
    );
  });

  it("単位を取らない項目に単位を付けると拒否する", () => {
    expect(measurementInputSchema.safeParse({ field_code: "obd_result", judgment: "pass", unit: "kg" }).success).toBe(
      false,
    );
    expect(measurementInputSchema.safeParse({ field_code: "obd_result", judgment: "pass" }).success).toBe(true);
  });

  it("source は未指定で manual 既定", () => {
    const r = measurementInputSchema.safeParse({ field_code: "co", num_value: 0.3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe("manual");
  });

  it("カタログの各定義は一意の code を持つ", () => {
    const codes = MEASUREMENT_FIELDS.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("measurementsPutSchema: 妥当な配列を受理する", () => {
    const r = measurementsPutSchema.safeParse({
      measurements: [
        { field_code: "brake.total", num_value: 1000, unit: "N" },
        { field_code: "co", num_value: 0.3 },
        { field_code: "obd_result", judgment: "pass" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("measurementsPutSchema: field_code 重複を拒否する", () => {
    const r = measurementsPutSchema.safeParse({
      measurements: [
        { field_code: "co", num_value: 0.3 },
        { field_code: "co", num_value: 0.4 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("measurementsPutSchema: 不正メンバー（未知コード）を拒否する", () => {
    const r = measurementsPutSchema.safeParse({ measurements: [{ field_code: "bogus", num_value: 1 }] });
    expect(r.success).toBe(false);
  });
});
