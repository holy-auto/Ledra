import { describe, it, expect } from "vitest";
import { memberLimit, memberLimitLabel, canAddMember } from "./memberLimits";

// ─── memberLimit ───
describe("memberLimit", () => {
  it("freeプランは1人", () => {
    expect(memberLimit("free")).toBe(1);
  });

  it("starterプランは3人", () => {
    expect(memberLimit("starter")).toBe(3);
  });

  it("standardプランは7人", () => {
    expect(memberLimit("standard")).toBe(7);
  });

  it("proプランは15人", () => {
    expect(memberLimit("pro")).toBe(15);
  });
});

// ─── memberLimitLabel ───
describe("memberLimitLabel", () => {
  it("数値上限は「N人」と表示", () => {
    expect(memberLimitLabel("free")).toBe("1人");
    expect(memberLimitLabel("starter")).toBe("3人");
    expect(memberLimitLabel("standard")).toBe("7人");
    expect(memberLimitLabel("pro")).toBe("15人");
  });
});

// ─── canAddMember ───
describe("canAddMember", () => {
  describe("freeプラン（上限1人）", () => {
    it("0人なら追加可能", () => {
      expect(canAddMember("free", 0)).toBe(true);
    });

    it("1人なら追加不可", () => {
      expect(canAddMember("free", 1)).toBe(false);
    });

    it("2人なら追加不可", () => {
      expect(canAddMember("free", 2)).toBe(false);
    });
  });

  describe("starterプラン（上限3人）", () => {
    it("2人なら追加可能", () => {
      expect(canAddMember("starter", 2)).toBe(true);
    });

    it("3人なら追加不可", () => {
      expect(canAddMember("starter", 3)).toBe(false);
    });
  });

  describe("standardプラン（上限7人）", () => {
    it("6人なら追加可能", () => {
      expect(canAddMember("standard", 6)).toBe(true);
    });

    it("7人なら追加不可", () => {
      expect(canAddMember("standard", 7)).toBe(false);
    });
  });

  describe("proプラン（上限15人）", () => {
    it("14人なら追加可能", () => {
      expect(canAddMember("pro", 14)).toBe(true);
    });

    it("15人なら追加不可", () => {
      expect(canAddMember("pro", 15)).toBe(false);
    });
  });
});
