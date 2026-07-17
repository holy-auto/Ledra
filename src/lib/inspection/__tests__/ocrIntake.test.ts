import { describe, it, expect } from "vitest";
import { planInspectionOcrIntake, buildTireSummary, type InspectionOcrPayload, type OcrIntakeItem } from "../ocrIntake";

const ITEMS: OcrIntakeItem[] = [
  { id: "i1", label: "走行距離(km)", type: "numeric" },
  { id: "i2", label: "タイヤ残溝", type: "numeric" },
  { id: "i3", label: "ライト点灯", type: "ok_ng" },
];

function odo(overrides: Partial<InspectionOcrPayload> = {}): InspectionOcrPayload {
  return {
    target: "odometer",
    mileage_km: 82000,
    tread_depth_mm: null,
    slip_sign_exposed: null,
    condition_notes: [],
    warnings: [],
    tire_advice: null,
    ...overrides,
  };
}
function tire(overrides: Partial<InspectionOcrPayload> = {}): InspectionOcrPayload {
  return {
    target: "tire",
    mileage_km: null,
    tread_depth_mm: 3.2,
    slip_sign_exposed: false,
    condition_notes: [],
    warnings: [],
    tire_advice: "replace_soon",
    ...overrides,
  };
}

describe("planInspectionOcrIntake — odometer", () => {
  it("走行距離ラベルの numeric 項目へ流し込む", () => {
    const plan = planInspectionOcrIntake(odo(), ITEMS);
    expect(plan.fill).toEqual({ itemId: "i1", value: "82000" });
    expect(plan.noteLines).toEqual([]);
  });

  it("対応項目が無ければ特記事項に追記する", () => {
    const plan = planInspectionOcrIntake(odo(), [{ id: "x", label: "ライト", type: "ok_ng" }]);
    expect(plan.fill).toBeUndefined();
    expect(plan.noteLines).toEqual(["走行距離: 82,000 km"]);
  });

  it("読み取れなければ fill せずメッセージのみ、warning を併記する", () => {
    const plan = planInspectionOcrIntake(odo({ mileage_km: null, warnings: ["ブレあり"] }), ITEMS);
    expect(plan.fill).toBeUndefined();
    expect(plan.noteLines).toEqual([]);
    expect(plan.message).toContain("ブレあり");
  });
});

describe("planInspectionOcrIntake — tire", () => {
  it("残溝を numeric 項目へ流し込みつつ、所見は必ず特記事項に残す", () => {
    const plan = planInspectionOcrIntake(tire({ condition_notes: ["ひび割れ"] }), ITEMS);
    expect(plan.fill).toEqual({ itemId: "i2", value: "3.2" });
    expect(plan.noteLines[0]).toContain("残溝 3.2mm");
    expect(plan.noteLines).toContain("  - ひび割れ");
  });

  it("スリップサイン露出は要交換として要約に出る", () => {
    const plan = planInspectionOcrIntake(
      tire({ tread_depth_mm: 1.4, slip_sign_exposed: true, tire_advice: "replace_now" }),
      [],
    );
    expect(plan.fill).toBeUndefined(); // 対応項目なし
    expect(plan.noteLines[0]).toContain("スリップサイン露出");
    expect(plan.noteLines[0]).toContain("要交換");
  });

  it("何も読み取れなければ fill せずメッセージのみ", () => {
    const plan = planInspectionOcrIntake(
      tire({ tread_depth_mm: null, slip_sign_exposed: null, condition_notes: [] }),
      ITEMS,
    );
    expect(plan.fill).toBeUndefined();
    expect(plan.noteLines).toEqual([]);
    expect(plan.message).toContain("読み取れ");
  });
});

describe("buildTireSummary", () => {
  it("残溝・スリップ・目安を1行に連結する", () => {
    expect(buildTireSummary(tire({ tread_depth_mm: 5, tire_advice: "ok" }))).toBe("タイヤ: 残溝 5mm / 残溝良好");
  });
});
