import { describe, it, expect } from "vitest";
import { ONBOARDING_QUESTIONS, buildKnowledgeEntries } from "../lineKnowledgeOnboardingQuestions";

describe("buildKnowledgeEntries", () => {
  it("maps answered questions to {title, content} and skips blanks", () => {
    const entries = buildKnowledgeEntries({
      hours: "平日 9:00〜18:00、日曜定休です。",
      address: "   ", // 空白のみ → スキップ
      loaner: "代車は2台ご用意しています。",
    });
    expect(entries).toEqual([
      { title: "営業時間・定休日", content: "平日 9:00〜18:00、日曜定休です。" },
      { title: "代車の有無", content: "代車は2台ご用意しています。" },
    ]);
  });

  it("returns an empty array when nothing is answered", () => {
    expect(buildKnowledgeEntries({})).toEqual([]);
  });

  it("keeps question order and covers every fixed question when all are answered", () => {
    const answers = Object.fromEntries(ONBOARDING_QUESTIONS.map((q) => [q.key, `${q.title}の回答`]));
    const entries = buildKnowledgeEntries(answers);
    expect(entries.map((e) => e.title)).toEqual(ONBOARDING_QUESTIONS.map((q) => q.title));
  });

  it("has unique keys and titles in the fixed question list", () => {
    const keys = ONBOARDING_QUESTIONS.map((q) => q.key);
    const titles = ONBOARDING_QUESTIONS.map((q) => q.title);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(titles).size).toBe(titles.length);
    // title はナレッジのタイトルとして保存されるため DB CHECK (≤200字) に収まること
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(200);
  });
});
