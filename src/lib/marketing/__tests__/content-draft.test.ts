import { describe, it, expect } from "vitest";
import { shouldHideDraft } from "../content";

describe("shouldHideDraft（下書きの露出制御）", () => {
  it("下書きでなければ常に表示（隠さない）", () => {
    expect(shouldHideDraft(false, { VERCEL_ENV: "production" })).toBe(false);
    expect(shouldHideDraft(undefined, { VERCEL_ENV: "production" })).toBe(false);
  });

  it("【安全性】本番(Vercel production)では下書きを必ず隠す", () => {
    expect(shouldHideDraft(true, { VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
  });

  it("【安全性】VERCEL_ENV 無しでも NODE_ENV=production なら隠す（自ホスト本番の流出防止）", () => {
    expect(shouldHideDraft(true, { NODE_ENV: "production" })).toBe(true);
  });

  it("Vercel プレビューでは下書きを表示（レビュー用）", () => {
    // preview は NODE_ENV=production だが VERCEL_ENV=preview
    expect(shouldHideDraft(true, { VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
  });

  it("ローカル開発では下書きを表示", () => {
    expect(shouldHideDraft(true, { NODE_ENV: "development" })).toBe(false);
  });
});
