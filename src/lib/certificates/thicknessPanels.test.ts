import { describe, it, expect } from "vitest";
import { mapPanelToPreset, THICKNESS_LOCATION_PRESETS } from "./thicknessPanels";

describe("mapPanelToPreset", () => {
  it("標準部位に完全一致すればそのまま返す", () => {
    for (const p of THICKNESS_LOCATION_PRESETS) {
      expect(mapPanelToPreset(p)).toBe(p);
    }
  });

  it("前後の空白を除去する", () => {
    expect(mapPanelToPreset("  ボンネット ")).toBe("ボンネット");
    expect(mapPanelToPreset("\nルーフ\t")).toBe("ルーフ");
  });

  it("既知の英語・略記エイリアスを標準部位へ寄せる", () => {
    expect(mapPanelToPreset("hood")).toBe("ボンネット");
    expect(mapPanelToPreset("HOOD")).toBe("ボンネット"); // 大文字小文字を無視
    expect(mapPanelToPreset("Roof")).toBe("ルーフ");
    expect(mapPanelToPreset("trunk")).toBe("トランク/リアゲート");
    expect(mapPanelToPreset("リアゲート")).toBe("トランク/リアゲート");
  });

  it("未知の部位名は trim した元文字列をそのまま返す（誤マッピングしない）", () => {
    expect(mapPanelToPreset("左クォーターパネル")).toBe("左クォーターパネル");
    expect(mapPanelToPreset(" フロントバンパー ")).toBe("フロントバンパー");
  });

  it("空・空白のみは空文字を返す", () => {
    expect(mapPanelToPreset("")).toBe("");
    expect(mapPanelToPreset("   ")).toBe("");
    // @ts-expect-error 実行時の null 安全も担保する
    expect(mapPanelToPreset(null)).toBe("");
  });
});
