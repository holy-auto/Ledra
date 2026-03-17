import { describe, it, expect } from "vitest";
import { memberLimit, memberLimitLabel, canAddMember } from "./memberLimits";

// ─── memberLimit ───
describe("memberLimit", () => {
  it("miniプランは1人", () => {
    expect(memberLimit("mini")).toBe(1);
  });

  it("standardプランは5人", () => {
    expect(memberLimit("standard")).toBe(5);
  });

  it("proプランは無制限（null）", () => {
    expect(memberLimit("pro")).toBeNull();
  });
});

// ─── memberLimitLabel ───
describe("memberLimitLabel", () => {
  it("数値上限は「N人」と表示", () => {
    expect(memberLimitLabel("mini")).toBe("1人");
    expect(memberLimitLabel("standard")).toBe("5人");
  });

  it("無制限は「無制限」と表示", () => {
    expect(memberLimitLabel("pro")).toBe("無制限");
  });
});

// ─── canAddMember ───
describe("canAddMember", () => {
  describe("miniプラン（上限1人）", () => {
    it("0人なら追加可能", () => {
      expect(canAddMember("mini", 0)).toBe(true);
    });

    it("1人なら追加不可", () => {
      expect(canAddMember("mini", 1)).toBe(false);
    });

    it("2人なら追加不可", () => {
      expect(canAddMember("mini", 2)).toBe(false);
    });
  });

  describe("standardプラン（上限5人）", () => {
    it("4人なら追加可能", () => {
      expect(canAddMember("standard", 4)).toBe(true);
    });

    it("5人なら追加不可", () => {
      expect(canAddMember("standard", 5)).toBe(false);
    });
  });

  describe("proプラン（無制限）", () => {
    it("何人いても追加可能", () => {
      expect(canAddMember("pro", 0)).toBe(true);
      expect(canAddMember("pro", 100)).toBe(true);
      expect(canAddMember("pro", 999)).toBe(true);
    });
  });
});
