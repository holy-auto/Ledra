import { describe, it, expect } from "vitest";
import { knowledgeFacts, generateReplyDraft } from "../replyDraft";

describe("knowledgeFacts", () => {
  it("returns null for empty / whitespace-only knowledge", () => {
    expect(knowledgeFacts(undefined)).toBeNull();
    expect(knowledgeFacts([])).toBeNull();
    expect(knowledgeFacts([{ title: "営業時間", content: "   " }])).toBeNull();
  });

  it("formats entries with and without a title, dropping empty-content ones", () => {
    const out = knowledgeFacts([
      { title: "営業時間", content: "平日10-19時" },
      { title: "", content: "定休日は水曜" },
      { title: "無視", content: "" },
    ]);
    expect(out).toContain("店舗ナレッジ");
    expect(out).toContain("- 営業時間: 平日10-19時");
    expect(out).toContain("- 定休日は水曜");
    expect(out).not.toContain("無視");
  });

  it("labels tenant and shared blocks separately with tenant precedence", () => {
    const out = knowledgeFacts([{ title: "定休日", content: "水曜" }], [{ title: "共通", content: "参考情報" }]);
    expect(out).toContain("店舗ナレッジ (最優先。これに反する内容は書かない)");
    expect(out).toContain("共通ナレッジ (参考。店舗ナレッジと矛盾する場合は店舗ナレッジを優先)");
  });

  it("collapses multi-line content onto a single bullet", () => {
    const out = knowledgeFacts([{ title: "営業時間", content: "平日10-19時\n土曜は10-17時" }]);
    expect(out).toContain("- 営業時間: 平日10-19時 土曜は10-17時");
    expect(out).not.toContain("\n土曜");
  });
});

describe("generateReplyDraft", () => {
  it("returns an empty draft when there is no inbound turn to reply to", async () => {
    const r = await generateReplyDraft({ turns: [{ direction: "outbound", body: "こんにちは" }] });
    expect(r).toEqual({ draft_reply: "", confidence: 0, ai: false });
  });
});
