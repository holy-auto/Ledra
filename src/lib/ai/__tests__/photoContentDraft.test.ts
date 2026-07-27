import { describe, it, expect, vi } from "vitest";

// getAnthropicClient を throw させ、draftPhotoContent の fail-open を検証する。
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => {
    throw new Error("AI client should not be reachable in this test");
  },
  cacheableSystem: (s: string) => s,
}));

import { pickImagesForContentDraft, draftPhotoContent } from "../photoContentDraft";

describe("pickImagesForContentDraft", () => {
  const rows = [
    { id: "a", stage: "intake_before" },
    { id: "b", stage: "after" },
    { id: "c", stage: "unspecified" },
  ];

  it("既に提案済み（prev にキーあり）なら何もしない（証明書単位で1度だけ）", () => {
    expect(pickImagesForContentDraft(rows, { serviceCategory: "coating" }, 2)).toEqual([]);
  });

  it("after を優先し、残りを続けて max 枚まで選ぶ", () => {
    expect(pickImagesForContentDraft(rows, {}, 2)).toEqual(["b", "a"]);
  });

  it("空 rows / max<=0 は空配列", () => {
    expect(pickImagesForContentDraft([], {}, 2)).toEqual([]);
    expect(pickImagesForContentDraft(rows, {}, 0)).toEqual([]);
  });
});

describe("draftPhotoContent", () => {
  it("画像が無ければ AI を呼ばず other/空を返す", async () => {
    const r = await draftPhotoContent([], { model: "stub" });
    expect(r).toEqual({ serviceCategory: "other", contentDraft: "", confidence: 0 });
  });

  it("AI 呼び出しが失敗しても fail-open で other/空を返す（捏造しない）", async () => {
    const r = await draftPhotoContent([{ base64: "AAAA", mediaType: "image/jpeg" }], { model: "stub" });
    expect(r).toEqual({ serviceCategory: "other", contentDraft: "", confidence: 0 });
  });
});
