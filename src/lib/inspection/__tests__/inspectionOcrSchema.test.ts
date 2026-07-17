import { describe, it, expect } from "vitest";
import {
  normalizeInspectionOcr,
  assessTire,
  TIRE_LEGAL_LIMIT_MM,
  type InspectionOcrResult,
} from "../inspectionOcrSchema";

function fixture(overrides: Partial<InspectionOcrResult> = {}): InspectionOcrResult {
  return {
    target: "tire",
    confidence: 0.9,
    mileage_km: null,
    tread_depth_mm: null,
    tire_position: null,
    slip_sign_exposed: null,
    condition_notes: [],
    warnings: [],
    ...overrides,
  };
}

describe("normalizeInspectionOcr", () => {
  it("odometer では tire 系フィールドを捨てる", () => {
    const out = normalizeInspectionOcr(
      fixture({
        target: "odometer",
        mileage_km: 82000,
        tread_depth_mm: 5,
        slip_sign_exposed: true,
        tire_position: "front_left",
      }),
    );
    expect(out.mileage_km).toBe(82000);
    expect(out.tread_depth_mm).toBeNull();
    expect(out.tire_position).toBeNull();
    expect(out.slip_sign_exposed).toBeNull();
  });

  it("tire では mileage を捨て、位置未指定は unknown に補完する", () => {
    const out = normalizeInspectionOcr(
      fixture({ target: "tire", mileage_km: 99999, tread_depth_mm: 4.2, tire_position: null }),
    );
    expect(out.mileage_km).toBeNull();
    expect(out.tread_depth_mm).toBe(4.2);
    expect(out.tire_position).toBe("unknown");
  });

  it("妥当範囲外の走行距離は破棄して warning を積む", () => {
    const out = normalizeInspectionOcr(fixture({ target: "odometer", mileage_km: 9_999_999 }));
    expect(out.mileage_km).toBeNull();
    expect(out.warnings.some((w) => w.includes("走行距離"))).toBe(true);
  });

  it("妥当範囲外の残溝 (負 / 上限超) は破棄して warning を積む", () => {
    const neg = normalizeInspectionOcr(fixture({ target: "tire", tread_depth_mm: -1 }));
    expect(neg.tread_depth_mm).toBeNull();
    const huge = normalizeInspectionOcr(fixture({ target: "tire", tread_depth_mm: 50 }));
    expect(huge.tread_depth_mm).toBeNull();
    expect(huge.warnings.some((w) => w.includes("残溝"))).toBe(true);
  });

  it("confidence を 0..1 にクランプする", () => {
    expect(normalizeInspectionOcr(fixture({ confidence: 1.5 })).confidence).toBe(1);
    expect(normalizeInspectionOcr(fixture({ confidence: -0.3 })).confidence).toBe(0);
    expect(normalizeInspectionOcr(fixture({ confidence: Number.NaN })).confidence).toBe(0);
  });

  it("condition_notes / warnings を trim + 空除去 + 重複排除する", () => {
    const out = normalizeInspectionOcr(
      fixture({
        target: "tire",
        condition_notes: [" ひび割れ ", "ひび割れ", "", "偏摩耗"],
        warnings: ["反射", "反射"],
      }),
    );
    expect(out.condition_notes).toEqual(["ひび割れ", "偏摩耗"]);
    expect(out.warnings).toEqual(["反射"]);
  });
});

describe("assessTire", () => {
  it("スリップサイン露出は即交換", () => {
    expect(assessTire({ tread_depth_mm: 6, slip_sign_exposed: true })).toBe("replace_now");
  });

  it("法定限度 (1.6mm) 以下は即交換", () => {
    expect(assessTire({ tread_depth_mm: TIRE_LEGAL_LIMIT_MM, slip_sign_exposed: false })).toBe("replace_now");
    expect(assessTire({ tread_depth_mm: 1.2, slip_sign_exposed: null })).toBe("replace_now");
  });

  it("3mm 以下は交換推奨、それ超は OK", () => {
    expect(assessTire({ tread_depth_mm: 2.5, slip_sign_exposed: false })).toBe("replace_soon");
    expect(assessTire({ tread_depth_mm: 5, slip_sign_exposed: false })).toBe("ok");
  });

  it("溝が読めない場合は unknown", () => {
    expect(assessTire({ tread_depth_mm: null, slip_sign_exposed: null })).toBe("unknown");
  });
});
