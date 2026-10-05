import { describe, it, expect } from "vitest";
import {
  buildQualificationSnapshot,
  isQualificationValid,
  normalizeQualificationDetails,
  todayInJst,
  type QualificationDetail,
} from "../qualificationStatus";

describe("qualificationStatus", () => {
  describe("isQualificationValid", () => {
    it("未保有は常に false（期限が未来でも）", () => {
      const details: QualificationDetail[] = [
        { qualification: "vehicle_inspector", number: "A-1", expires_on: "2999-12-31" },
      ];
      expect(isQualificationValid([], details, "vehicle_inspector", "2026-10-02")).toBe(false);
    });

    it("保有かつ有効期限未登録は無期限扱いで true", () => {
      expect(isQualificationValid(["vehicle_inspector"], [], "vehicle_inspector", "2026-10-02")).toBe(true);
    });

    it("保有かつ期限当日は有効（当日まで）", () => {
      const details: QualificationDetail[] = [
        { qualification: "vehicle_inspector", number: null, expires_on: "2026-10-02" },
      ];
      expect(isQualificationValid(["vehicle_inspector"], details, "vehicle_inspector", "2026-10-02")).toBe(true);
    });

    it("保有だが期限切れ（翌日）は false", () => {
      const details: QualificationDetail[] = [
        { qualification: "vehicle_inspector", number: null, expires_on: "2026-10-01" },
      ];
      expect(isQualificationValid(["vehicle_inspector"], details, "vehicle_inspector", "2026-10-02")).toBe(false);
    });

    it("別資格の明細は当該資格の判定に影響しない", () => {
      const details: QualificationDetail[] = [
        { qualification: "maintenance_supervisor", number: null, expires_on: "2000-01-01" },
      ];
      // vehicle_inspector は保有・期限未登録 → 有効（別資格の失効は無関係）
      expect(isQualificationValid(["vehicle_inspector"], details, "vehicle_inspector", "2026-10-02")).toBe(true);
    });
  });

  describe("buildQualificationSnapshot", () => {
    it("保有キーごとに番号/期限を明細から拾い、未知キーは落とす", () => {
      const details: QualificationDetail[] = [
        { qualification: "vehicle_inspector", number: "検査員-123", expires_on: "2027-03-31" },
      ];
      const snap = buildQualificationSnapshot(["vehicle_inspector", "bogus", "record_author"], details);
      expect(snap).toEqual([
        { qualification: "vehicle_inspector", number: "検査員-123", expires_on: "2027-03-31" },
        { qualification: "record_author", number: null, expires_on: null },
      ]);
    });

    it("保有が空ならスナップショットも空", () => {
      expect(buildQualificationSnapshot([], [])).toEqual([]);
    });
  });

  describe("normalizeQualificationDetails", () => {
    it("配列でない/未知キー/異型を捨てて安全化する", () => {
      const input = [
        { qualification: "vehicle_inspector", number: "A", expires_on: "2027-01-01" },
        { qualification: "unknown_key", number: "B", expires_on: null },
        { qualification: "record_author", number: 123, expires_on: 456 }, // 異型 → null 化
        "not-an-object",
        null,
      ];
      expect(normalizeQualificationDetails(input)).toEqual([
        { qualification: "vehicle_inspector", number: "A", expires_on: "2027-01-01" },
        { qualification: "record_author", number: null, expires_on: null },
      ]);
      expect(normalizeQualificationDetails("nope")).toEqual([]);
      expect(normalizeQualificationDetails(null)).toEqual([]);
    });
  });

  describe("todayInJst", () => {
    it("UTC 深夜でも Asia/Tokyo の日付（+9h で翌日）を返す", () => {
      // 2026-10-02T20:00:00Z は JST では 2026-10-03 05:00。
      expect(todayInJst(new Date("2026-10-02T20:00:00Z"))).toBe("2026-10-03");
      // 2026-10-02T00:00:00Z は JST では 2026-10-02 09:00。
      expect(todayInJst(new Date("2026-10-02T00:00:00Z"))).toBe("2026-10-02");
    });
  });
});
