import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL_VISION: "claude-test-vision",
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
  parseJsonResponse: <T>(text: string): T => {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  },
}));

import { generateBeforeAfterDiff, normalizeImageMimeType } from "@/lib/ai/beforeAfterDiff";

describe("normalizeImageMimeType", () => {
  it("normalizes jpeg variants", () => {
    expect(normalizeImageMimeType("image/jpeg")).toBe("image/jpeg");
    expect(normalizeImageMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeImageMimeType("IMAGE/JPEG")).toBe("image/jpeg");
  });
  it("accepts png + webp", () => {
    expect(normalizeImageMimeType("image/png")).toBe("image/png");
    expect(normalizeImageMimeType("image/webp")).toBe("image/webp");
  });
  it("rejects unsupported", () => {
    expect(normalizeImageMimeType("image/gif")).toBeNull();
    expect(normalizeImageMimeType("application/pdf")).toBeNull();
    expect(normalizeImageMimeType(null)).toBeNull();
    expect(normalizeImageMimeType("")).toBeNull();
  });
});

describe("generateBeforeAfterDiff", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  function mockResponse(payload: object) {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(payload) }],
    });
  }

  it("returns the parsed summary and highlights on success", async () => {
    mockResponse({
      compare_possible: true,
      summary: "ボディの傷が除去され、塗装の艶が大幅に向上している。",
      highlights: ["線傷の除去", "光沢の向上", "色ムラの均一化"],
    });

    const r = await generateBeforeAfterDiff({
      beforeBase64: "AAA",
      beforeMediaType: "image/jpeg",
      afterBase64: "BBB",
      afterMediaType: "image/jpeg",
    });

    expect(r.comparePossible).toBe(true);
    expect(r.summary).toContain("艶");
    expect(r.highlights).toHaveLength(3);
    expect(r.model).toBe("claude-test-vision");
  });

  it("caps highlights to 3 items", async () => {
    mockResponse({
      compare_possible: true,
      summary: "改善あり。",
      highlights: ["a", "b", "c", "d", "e"],
    });
    const r = await generateBeforeAfterDiff({
      beforeBase64: "x",
      beforeMediaType: "image/jpeg",
      afterBase64: "y",
      afterMediaType: "image/jpeg",
    });
    expect(r.highlights).toEqual(["a", "b", "c"]);
  });

  it("returns comparePossible=false when the model says so", async () => {
    mockResponse({
      compare_possible: false,
      summary: "撮影角度が異なるため比較できません。",
      highlights: [],
    });
    const r = await generateBeforeAfterDiff({
      beforeBase64: "x",
      beforeMediaType: "image/png",
      afterBase64: "y",
      afterMediaType: "image/png",
    });
    expect(r.comparePossible).toBe(false);
    expect(r.summary).toContain("比較できません");
  });

  it("throws when the response has no summary", async () => {
    mockResponse({ compare_possible: true, summary: "", highlights: [] });
    await expect(
      generateBeforeAfterDiff({
        beforeBase64: "x",
        beforeMediaType: "image/jpeg",
        afterBase64: "y",
        afterMediaType: "image/jpeg",
      }),
    ).rejects.toThrow(/no summary/);
  });

  it("throws when the response is not JSON", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] });
    await expect(
      generateBeforeAfterDiff({
        beforeBase64: "x",
        beforeMediaType: "image/jpeg",
        afterBase64: "y",
        afterMediaType: "image/jpeg",
      }),
    ).rejects.toThrow();
  });

  it("strips control characters from summary", async () => {
    mockResponse({
      compare_possible: true,
      summary: "差分検出あり",
      highlights: ["項目A"],
    });
    const r = await generateBeforeAfterDiff({
      beforeBase64: "x",
      beforeMediaType: "image/jpeg",
      afterBase64: "y",
      afterMediaType: "image/jpeg",
    });
    expect(r.summary).toBe("差分検出あり");
    expect(r.highlights).toEqual(["項目A"]);
  });
});
