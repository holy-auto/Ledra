import { describe, it, expect } from "vitest";
import { composeAiDraftContent } from "../composeAiDraftContent";

describe("composeAiDraftContent", () => {
  it("title/description のみ（VoiceMemo 相当）はそのまま連結する", () => {
    const out = composeAiDraftContent({
      title: "ガラスコーティング施工",
      description: "全面施工しました。",
      cautions: "",
    });
    expect(out).toBe("ガラスコーティング施工\n\n全面施工しました。");
  });

  it("施工箇所・使用材料・保証・注意事項を全て取りこぼさず含める", () => {
    const out = composeAiDraftContent({
      title: "PPF施工",
      description: "フロント周りに施工。",
      cautions: "48時間は洗車を避けてください。",
      workAreas: ["ボンネット", "フロントバンパー"],
      materials: [{ name: "XPEL ULTIMATE PLUS", maker: "XPEL", spec: "8mil" }, { name: "専用プライマー" }],
      warrantyCandidates: ["10年"],
    });
    expect(out).toContain("【施工箇所】\nボンネット、フロントバンパー");
    expect(out).toContain("【使用材料】\n・XPEL ULTIMATE PLUS / XPEL (8mil)\n・専用プライマー");
    expect(out).toContain("【保証（候補）】\n10年");
    expect(out).toContain("【注意事項】\n48時間は洗車を避けてください。");
  });

  it("空のセクションは見出しごと出さない", () => {
    const out = composeAiDraftContent({
      title: "コーティング",
      description: "施工完了。",
      cautions: "",
      workAreas: [],
      materials: [],
      warrantyCandidates: [],
    });
    expect(out).toBe("コーティング\n\n施工完了。");
    expect(out).not.toContain("【施工箇所】");
    expect(out).not.toContain("【使用材料】");
  });

  it("材料の空名称・重複する箇所/保証は落とす", () => {
    const out = composeAiDraftContent({
      title: "t",
      description: "d",
      cautions: "",
      workAreas: [" 屋根 ", "屋根", ""],
      materials: [{ name: "  " }, { name: "セラミック", maker: " M " }],
      warrantyCandidates: ["3年", "3年"],
    });
    expect(out).toContain("【施工箇所】\n屋根");
    expect(out).not.toContain("屋根、屋根");
    expect(out).toContain("【使用材料】\n・セラミック / M");
    expect(out).toContain("【保証（候補）】\n3年");
    expect(out).not.toContain("3年、3年");
  });

  it("ブロックは空行1つで区切られる", () => {
    const out = composeAiDraftContent({
      title: "t",
      description: "d",
      cautions: "c",
      workAreas: ["A"],
    });
    expect(out).toBe("t\n\nd\n\n【施工箇所】\nA\n\n【注意事項】\nc");
  });
});
