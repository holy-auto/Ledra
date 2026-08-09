import { describe, it, expect } from "vitest";
import { STAGE_VALUES, normalizeStage } from "@/lib/certificateImages/stage";

describe("certificate photo stage", () => {
  it("STAGE_VALUES は DB `stage` 列とゲートが期待する4値と厳密一致する", () => {
    // 前後ゲート (photoRequirement.ts) は intake_before / after を、アップロードは
    // in_progress / unspecified も許す。ここが drift するとモバイル選択がサーバで弾かれる。
    expect([...STAGE_VALUES]).toEqual(["intake_before", "in_progress", "after", "unspecified"]);
  });

  it("有効ラベルは自身へ写す", () => {
    for (const v of STAGE_VALUES) {
      expect(normalizeStage(v)).toBe(v);
    }
  });

  it("未知・空・null・空白は unspecified に落とす", () => {
    expect(normalizeStage("")).toBe("unspecified");
    expect(normalizeStage("   ")).toBe("unspecified");
    expect(normalizeStage(null)).toBe("unspecified");
    expect(normalizeStage(undefined)).toBe("unspecified");
    expect(normalizeStage("before")).toBe("unspecified");
    expect(normalizeStage("INTAKE_BEFORE")).toBe("unspecified");
  });

  it("前後の空白は許容して正規化する", () => {
    expect(normalizeStage("  after  ")).toBe("after");
  });
});
