/**
 * `requireNative` のテスト。
 *
 * なぜ要るか: この関数の存在理由は「skip しないこと」である。フラグを立てて後段で
 * `ctx.skip()` する形に戻ると、検査は「走らなかったのに緑」に戻る（それが
 * OPEN_QUESTIONS 2026-09-14 起票の中身だった）。**失敗したら投げる**という
 * 一点だけを固定する。成功時に素通しすることも合わせて見る —— 失敗側だけ見ていると、
 * 「常に投げる」実装でもテストが通ってしまう。
 */
import { describe, it, expect } from "vitest";
import { requireNative } from "./nativeImaging";

describe("requireNative（fail-closed のネイティブ依存ローダ）", () => {
  it("読み込めたらその値をそのまま返す", async () => {
    const mod = { Reader: {} };
    await expect(requireNative(async () => mod, "dummy")).resolves.toBe(mod);
  });

  it("読み込めなければ投げる（skip でも undefined でもない）", async () => {
    await expect(
      requireNative(() => Promise.reject(new Error("Cannot find package 'x'")), "@contentauth/c2pa-node"),
    ).rejects.toThrow(/@contentauth\/c2pa-node/);
  });

  it("失敗メッセージに fail-closed であることと対処が入っている", async () => {
    const err = await requireNative(() => Promise.reject(new Error("boom")), "sharp").catch((e: Error) => e);
    expect(err.message, "何が読み込めなかったか").toContain("sharp");
    expect(err.message, "skip しないと明示する").toContain("fail-closed");
    expect(err.message, "未インストールの対処").toContain("npm ci");
    expect(err.message, "別プラットフォームの対処").toContain("invalid ELF header");
  });

  it("元の例外を cause に残す（未インストールか壊れたバイナリかを区別できる）", async () => {
    const cause = new Error("invalid ELF header");
    const err = await requireNative(() => Promise.reject(cause), "sharp").catch((e: Error) => e);
    expect(err.cause, "原因が辿れる").toBe(cause);
  });
});
