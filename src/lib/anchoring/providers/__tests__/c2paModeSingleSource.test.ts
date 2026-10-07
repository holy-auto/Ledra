import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * `C2PA_MODE` の正規化を `getMode()`（`providers/c2pa.ts`）1箇所に閉じる。
 *
 * ## なぜ要るか
 *
 * #1209 で `getMode()` を export し、PR 本文とコード内コメントに
 * 「**`getMode()` が唯一の正規化源**」と書いた。**嘘だった。** 2026-10-07 に数えたら、
 * 本番コードの3箇所が `process.env.C2PA_MODE` を直接読んでいた
 * （`polygon-backfill/route.ts` は `as "disabled" | "dev-signed" | "production"` の
 * 素のキャスト付き）。ゲートが触る経路だけ直して、同じ env を読む兄弟を数えなかった
 * （MISTAKE_LEDGER `M-20261007-claimed-single-source-without-grepping-the-siblings`）。
 *
 * 綴り違い（`Production` 等）で今日ただちに壊れるわけではないが、`getMode()` は
 * 未知の値を `disabled` に落とすのに、素の読みは生の文字列をそのまま下流へ渡す。
 * 下流の比較が1つ変わればそこで分岐する。**同じ事実を2箇所に書かない**のが安い。
 *
 * ## これは構造テストである（型 G に注意）
 *
 * 守りたい主張がそもそも構造（「読む場所が1つ」）なので、ソースを走査して数える。
 * **値が正しく正規化されるかは別のテストが見る**（`providers.test.ts` の `getMode()`
 * 6ケース）。この2本は役割が違うので、どちらも要る。
 */
describe("C2PA_MODE は getMode() が唯一の正規化源", () => {
  const SRC = path.resolve(__dirname, "../../../..");
  /** 正規化の実装そのもの。ここだけは生の env を読んでよい。 */
  const OWNER = path.join(SRC, "lib", "anchoring", "providers", "c2pa.ts");

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        // テストは env を直接いじってよい（正規化の挙動を試すため）。
        if (name === "__tests__" || name === "node_modules") continue;
        walk(full, out);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("本番コードで process.env.C2PA_MODE を読むのは c2pa.ts の getMode() だけ", () => {
    const files = walk(SRC);
    expect(files.length, "走査対象が0件なら、このテスト自体が何も見ていない").toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      if (file === OWNER) continue;
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.includes("process.env.C2PA_MODE")) {
          offenders.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      [
        "C2PA_MODE を直接読んでいる箇所がある。`getMode()` を使うこと",
        '（`import { getMode as getC2paMode } from "@/lib/anchoring/providers/c2pa"`）。',
        "生の読みは未知の値をそのまま下流に渡すので、綴り違いが黙って通る:",
        ...offenders,
      ].join("\n"),
    ).toEqual([]);
  });

  it("c2pa.ts 側には実際に読んでいる行がある（走査の当たりを取る）", () => {
    // 上のテストが「0件」で緑になるのは、走査が壊れていても同じに見える。
    // 唯一の正当な読み手を**見つけられる**ことを確かめて、陰性対照にする。
    const src = readFileSync(OWNER, "utf8");
    expect(src, "getMode() の実装が生の env を読んでいるはず").toContain("process.env.C2PA_MODE");
  });
});
