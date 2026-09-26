import { describe, it, expect } from "vitest";
import { renderIndicatedInspectionPdf, type IndicatedInspectionPdfData } from "../pdfIndicatedInspection";

const base: Omit<IndicatedInspectionPdfData, "form" | "measurements" | "visual" | "match"> = {
  facility: { name: "株式会社HOLY 指定工場" },
  inspectorName: "堀越 友輔",
  inspectedAt: "2026-09-25T00:00:00Z",
  vehicle: { maker: "トヨタ", model: "プリウス", plate: "品川 300 あ 12-34" },
  customerName: "山田 太郎",
  notes: "保安基準適合を確認。",
  generatedAt: "2026-09-25T09:00:00Z",
};

describe("renderIndicatedInspectionPdf", () => {
  it("第三号様式(四輪)を測定値・目視・照合入りで非空の PDF に描画する", async () => {
    const data: IndicatedInspectionPdfData = {
      ...base,
      form: "sanago",
      measurements: [
        { field_code: "brake.total", num_value: 4500, text_value: null, unit: "N", judgment: null },
        { field_code: "co", num_value: 0.5, text_value: null, unit: "%", judgment: null },
        { field_code: "obd_result", num_value: null, text_value: null, unit: null, judgment: "pass" },
        { field_code: "side_slip", num_value: null, text_value: "IN 3", unit: "mm/m", judgment: null },
      ],
      visual: {
        "visual.structure.ground_clearance": "pass",
        "visual.device.braking": "pass",
        "visual.device.autonomous": "na",
        "visual.device.other": "fail",
      },
      match: {
        "match.vehicle_type": "普通",
        "match.fuel_type": "ガソリン",
        "match.model": "DAA-ZVW51",
        "match.max_load": "500",
      },
    };
    const buf = await renderIndicatedInspectionPdf(data);
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 60_000);

  it("第四号様式(二輪)を測定値・目視・照合ゼロ(全セル空欄)でも描画できる", async () => {
    const data: IndicatedInspectionPdfData = {
      ...base,
      form: "yonago",
      vehicle: null,
      customerName: null,
      notes: null,
      measurements: [],
      visual: {},
      match: {},
    };
    const buf = await renderIndicatedInspectionPdf(data);
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 60_000);
});
