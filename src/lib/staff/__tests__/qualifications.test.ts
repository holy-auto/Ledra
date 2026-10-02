import { describe, it, expect } from "vitest";
import {
  STAFF_QUALIFICATIONS,
  isStaffQualificationKey,
  normalizeQualifications,
  qualificationLabel,
} from "../qualifications";

describe("staff qualifications catalog [G1 法定資格ロール]", () => {
  it("3つの法定資格・職責を定義する（自動車検査員 / 整備主任者 / 起票入力担当）", () => {
    expect(STAFF_QUALIFICATIONS.map((q) => q.key)).toEqual([
      "vehicle_inspector",
      "maintenance_supervisor",
      "record_author",
    ]);
  });

  it("isStaffQualificationKey は統制語彙だけを真にする", () => {
    expect(isStaffQualificationKey("vehicle_inspector")).toBe(true);
    expect(isStaffQualificationKey("admin")).toBe(false); // SaaS ロールは別軸
    expect(isStaffQualificationKey("ppf")).toBe(false); // skills タグは別軸
    expect(isStaffQualificationKey(null)).toBe(false);
  });

  it("normalizeQualifications は未知キーを落とし・重複を除き・順序を保つ", () => {
    expect(
      normalizeQualifications([
        "maintenance_supervisor",
        "bogus", // 未知 → 除外
        "maintenance_supervisor", // 重複 → 1回
        "vehicle_inspector",
      ]),
    ).toEqual(["maintenance_supervisor", "vehicle_inspector"]);
    expect(normalizeQualifications(null)).toEqual([]);
    expect(normalizeQualifications(undefined)).toEqual([]);
  });

  it("qualificationLabel はキーをラベルに、未知キーはそのまま返す", () => {
    expect(qualificationLabel("vehicle_inspector")).toBe("自動車検査員");
    expect(qualificationLabel("unknown_future_key")).toBe("unknown_future_key");
  });
});
