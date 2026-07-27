import { describe, it, expect } from "vitest";
import { tokenizeQuery } from "@/lib/ai/navTokens";

describe("tokenizeQuery", () => {
  it("助詞・動詞語尾を跨いで意味語を抽出する（予約→予約管理に当たる）", () => {
    // 「予約を開いて」は全文一致だと「予約管理」に当たらないが、トークンなら当たる。
    expect(tokenizeQuery("予約を開いて")).toContain("予約");
  });

  it("カタカナ連続を1トークンとして抽出する", () => {
    // 「未読メッセージある?」→「メッセージ」で「メッセージ管理」に当たる。
    expect(tokenizeQuery("未読メッセージある?")).toContain("メッセージ");
  });

  it("英数字連続を小文字化して抽出し、1文字ノイズは落とす", () => {
    const t = tokenizeQuery("INV-2024 を");
    expect(t).toContain("inv");
    expect(t).toContain("2024");
    expect(t).not.toContain("を"); // 1文字はトークン化しない
  });
});
