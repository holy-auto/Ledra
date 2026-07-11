import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderKnowledgeBlock, generateKnowledgeReply } from "../knowledgeReply";

describe("renderKnowledgeBlock", () => {
  it("numbers entries and wraps them in the given tag", () => {
    const block = renderKnowledgeBlock(
      [
        { title: "営業時間", content: "平日 9:00〜18:00" },
        { title: "駐車場", content: "3 台分あり (無料)" },
      ],
      "店舗ナレッジ",
    );
    expect(block).toContain("<店舗ナレッジ>");
    expect(block).toContain("</店舗ナレッジ>");
    expect(block).toContain("1. 営業時間\n平日 9:00〜18:00");
    expect(block).toContain("2. 駐車場\n3 台分あり (無料)");
  });

  it("returns an empty string (no empty tag block) for an empty list", () => {
    expect(renderKnowledgeBlock([], "共通ナレッジ")).toBe("");
  });
});

describe("generateKnowledgeReply fallback", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
  });

  it("returns a non-answering fallback when the API key is missing", async () => {
    const result = await generateKnowledgeReply({
      text: "営業時間は？",
      knowledge: [{ title: "営業時間", content: "平日 9:00〜18:00" }],
    });
    expect(result).toEqual({ can_answer: false, confidence: 0, ai: false });
  });

  it("returns the fallback when there is no knowledge at all", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = await generateKnowledgeReply({ text: "営業時間は？", knowledge: [], sharedKnowledge: [] });
    expect(result).toEqual({ can_answer: false, confidence: 0, ai: false });
  });
});
