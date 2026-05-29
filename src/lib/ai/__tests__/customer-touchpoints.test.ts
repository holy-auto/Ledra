import { describe, it, expect } from "vitest";
import { buildDeterministicClassification } from "../inquiryClassify";
import { buildDeterministicSentiment } from "../reviewSentiment";

describe("buildDeterministicClassification", () => {
  it("flags complaints as high priority", () => {
    const out = buildDeterministicClassification({
      subject: "ひどい対応について",
      message: "スタッフの態度が最悪でした。怒っています。",
    });
    expect(out.category).toBe("complaint");
    expect(out.priority).toBe("high");
  });

  it("classifies billing inquiries", () => {
    const out = buildDeterministicClassification({
      subject: "請求書について",
      message: "先月分の料金が気になります",
    });
    expect(out.category).toBe("billing");
  });

  it("classifies reservation change requests", () => {
    const out = buildDeterministicClassification({
      subject: "予約変更",
      message: "来週の予約をキャンセルしたいです",
    });
    expect(out.category).toBe("reservation");
  });

  it("classifies warranty / quality follow-ups", () => {
    const out = buildDeterministicClassification({
      subject: "施工後の不具合",
      message: "コーティングが剥がれてきました",
    });
    expect(out.category).toBe("warranty");
  });

  it("classifies praise as low priority", () => {
    const out = buildDeterministicClassification({
      subject: "ありがとうございました",
      message: "丁寧な対応で素晴らしかったです",
    });
    expect(out.category).toBe("praise");
    expect(out.priority).toBe("low");
  });

  it("falls back to other when no keyword matches", () => {
    const out = buildDeterministicClassification({
      subject: "お問い合わせ",
      message: "こんにちは。少し聞きたいことがあります。",
    });
    expect(out.category).toBe("other");
    expect(out.draft_reply).toBe("");
    expect(out.ai).toBe(false);
  });
});

describe("buildDeterministicSentiment", () => {
  it("maps NPS 9-10 to positive", () => {
    expect(buildDeterministicSentiment({ text: "good", npsScore: 10 }).sentiment).toBe("positive");
    expect(buildDeterministicSentiment({ text: "good", npsScore: 9 }).sentiment).toBe("positive");
  });

  it("maps NPS 0-6 to negative", () => {
    expect(buildDeterministicSentiment({ text: "meh", npsScore: 6 }).sentiment).toBe("negative");
    expect(buildDeterministicSentiment({ text: "meh", npsScore: 0 }).sentiment).toBe("negative");
  });

  it("treats NPS 7-8 as neutral", () => {
    expect(buildDeterministicSentiment({ text: "ok", npsScore: 7 }).sentiment).toBe("neutral");
    expect(buildDeterministicSentiment({ text: "ok", npsScore: 8 }).sentiment).toBe("neutral");
  });

  it("treats absent NPS as neutral with low confidence", () => {
    const out = buildDeterministicSentiment({ text: "ok" });
    expect(out.sentiment).toBe("neutral");
    expect(out.confidence).toBeLessThan(0.5);
  });

  it("uses leading text as a quick summary fallback", () => {
    const out = buildDeterministicSentiment({ text: "とても良かったです" });
    expect(out.summary).toContain("良かった");
  });

  it("marks negative reviews as actionable", () => {
    const out = buildDeterministicSentiment({ text: "悪い", npsScore: 3 });
    expect(out.actionable).toBe(true);
  });
});
