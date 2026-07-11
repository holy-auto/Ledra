/**
 * fieldKnowledgeAnswer (現場ナレッジ Q&A) の単体テスト。
 *
 * 検証する契約 (AIが事実を作らない土台):
 *   - APIキー無し → can_answer=false / ai=false (parse 呼ばない)
 *   - ナレッジ 0 件 → can_answer=false / ai=false (parse 呼ばない)
 *   - AI がナレッジのみで回答 → can_answer=true + answer、注入プロンプトに
 *     ナレッジ本文が含まれる
 *   - AI がナレッジ外と判断 → can_answer=false を素通しする
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KnowledgeEntry } from "@/lib/ai/knowledgeReply";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));

vi.mock("@/lib/http/withRetry", () => ({ withRetry: (_n: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: () => ({ messages: { parse: (...a: unknown[]) => parseMock(...a) } }),
  AI_MODEL_FAST: "fast",
}));

import { answerFieldKnowledge } from "../fieldKnowledgeAnswer";

const KNOWLEDGE: KnowledgeEntry[] = [
  { title: "30アルファードの前後ドラレコ", content: "左Aピラー内の配線でクリップ破損注意。平均2.5時間。" },
];

describe("answerFieldKnowledge", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("APIキー無しなら can_answer=false / ai=false を返し AI を呼ばない", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await answerFieldKnowledge({ question: "配線の注意点は？", knowledge: KNOWLEDGE });
    expect(r).toEqual({ can_answer: false, confidence: 0, ai: false });
    expect(parseMock).not.toHaveBeenCalled();
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });

  it("ナレッジ 0 件なら AI を呼ばずフォールバック", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const r = await answerFieldKnowledge({ question: "配線の注意点は？", knowledge: [] });
    expect(r.can_answer).toBe(false);
    expect(r.ai).toBe(false);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("ナレッジのみで回答でき、注入プロンプトにナレッジ本文が含まれる", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockResolvedValue({
      parsed_output: { can_answer: true, answer: "左Aピラー内の配線でクリップ破損に注意。", confidence: 0.8 },
    });

    const r = await answerFieldKnowledge({ question: "配線の注意点は？", knowledge: KNOWLEDGE });
    expect(r.can_answer).toBe(true);
    expect(r.answer).toContain("クリップ破損");
    expect(r.ai).toBe(true);

    const content = parseMock.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("左Aピラー内の配線でクリップ破損注意");
  });

  it("AI がナレッジ外と判断したら can_answer=false を素通しする", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    parseMock.mockResolvedValue({ parsed_output: { can_answer: false, confidence: 0.1 } });
    const r = await answerFieldKnowledge({ question: "タイヤ空気圧は？", knowledge: KNOWLEDGE });
    expect(r.can_answer).toBe(false);
    expect(r.ai).toBe(true);
  });
});
