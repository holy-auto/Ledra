import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { walkSource, stripComments } from "@/lib/__tests__/sourceScan";
import { parse, walk } from "@/lib/__tests__/astScan";
import ts from "typescript";

/**
 * `C2PA_MODE` の正規化を `getMode()`（`providers/c2paMode.ts`）1箇所に閉じる。
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
 * **値が正しく正規化されるかは別のテストが見る**（`providers.test.ts` の `getMode()` 6ケース）。
 *
 * ## 走査の作り
 *
 * 初版は生ソースに `includes("process.env.C2PA_MODE")` を当てていた。`/code-review` が
 * 2つの穴を実測で示した: (1) `process.env["C2PA_MODE"]` や分割代入は**素通り**、
 * (2) その語を書いた**コメントだけで CI が赤**になる。どちらもリポジトリが既に持っている
 * 道具で塞げる —— `stripComments()`（ヘッダに「構造テストは必ずこれを通してから照合すること」）と
 * AST 走査。walk も `walkSource()` に寄せ、除外リストの複製を作らない。
 */
describe("C2PA_MODE は getMode() が唯一の正規化源", () => {
  const ROOT = path.resolve(__dirname, "../../../../..");
  /** 正規化の実装そのもの。ここだけは生の env を読んでよい。 */
  const OWNER = path.join(ROOT, "src", "lib", "anchoring", "providers", "c2paMode.ts");
  /**
   * ビルド前の検査スクリプト。`next build` の前段で走り、TS を import できない素の
   * `.mjs` なので `getMode()` を呼べず、`=== "production"` を自前で書いている。
   * **正規化規則を変えるときはここも直す**（例: 空白の trim、別名の受理）。
   */
  const ALLOWED = new Set([OWNER, path.join(ROOT, "scripts", "check-c2pa-binary.mjs")]);

  /**
   * 走査対象。`.ts`/`.tsx` に加えて `.mjs`/`.cjs`/`.js` も見る。
   *
   * **`src/` と `scripts/` だけでは足りない**（/code-review 指摘・2026-10-08）。
   * この検査の前提は「`C2PA_MODE` がビルド時に見える」ことなので、**ビルド時に評価される
   * リポジトリ直下の設定ファイル**（`next.config.ts` / `instrumentation*.ts` /
   * `sentry.*.config.ts`）こそ、生の読みが入りそうな場所である。そこを見ていなかった。
   * 兄弟の走査（`scripts/check-schema.mjs`）が `src` と `apps/mobile/src` と `scripts` を
   * 対象にしているのに合わせ、`apps/` と `e2e/` と `supabase/` も足す。
   */
  const SCANNED_EXT = /\.(?:tsx?|mts|cts|mjs|cjs|js)$/;
  const isTarget = (name: string) => SCANNED_EXT.test(name) && !/\.test\.[a-z]+$/.test(name);
  const SCANNED_DIRS = ["src", "scripts", "apps", "e2e", "supabase"];
  /** 直下の設定ファイル。ビルド時に評価されるので、ここの生の読みは本番に効く。 */
  const ROOT_FILES = [
    "next.config.ts",
    "instrumentation.ts",
    "instrumentation-client.ts",
    "sentry.server.config.ts",
    "sentry.edge.config.ts",
    "sentry.client.config.ts",
    "playwright.config.ts",
    "vitest.config.ts",
    "eslint.config.mjs",
    "postcss.config.mjs",
  ];

  let cachedTargets: string[] | null = null;
  function targets(): string[] {
    cachedTargets ??= [
      ...SCANNED_DIRS.flatMap((d) => walkSource(path.join(ROOT, d), isTarget)),
      ...ROOT_FILES.map((f) => path.join(ROOT, f)).filter((f) => existsSync(f)),
    ];
    return cachedTargets;
  }

  /**
   * AST は重い（2500 ファイルを素で解析すると 8 秒かかる）。そこで**文字列で候補を絞る**。
   * この絞りは AST 判定の**上位集合**なので取りこぼさない —— `C2PA_MODE` という語を
   * 一度も書いていないファイルに、`process.env` からそれを取り出す式は書けない。
   * コメントだけの言及はここで拾われるが、AST 側が落とす。
   */
  let cachedCandidates: string[] | null = null;
  function candidates(): string[] {
    cachedCandidates ??= targets().filter((f) => readFileSync(f, "utf8").includes("C2PA_MODE"));
    return cachedCandidates;
  }

  /**
   * `process.env` から `C2PA_MODE` を取り出している箇所を AST で拾う。
   * `process.env.C2PA_MODE` / `process.env["C2PA_MODE"]` / `const { C2PA_MODE } = process.env`
   * のどれでも当たる。
   */
  function envReads(src: string, fileName: string): number[] {
    const sf = parse(stripComments(src, fileName), fileName);
    const hits: number[] = [];
    const isProcessEnv = (e: ts.Node): boolean =>
      ts.isPropertyAccessExpression(e) &&
      e.name.text === "env" &&
      ts.isIdentifier(e.expression) &&
      e.expression.text === "process";

    walk(sf, (n) => {
      // process.env.C2PA_MODE
      if (ts.isPropertyAccessExpression(n) && n.name.text === "C2PA_MODE" && isProcessEnv(n.expression)) {
        hits.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
        return;
      }
      // process.env["C2PA_MODE"]
      if (
        ts.isElementAccessExpression(n) &&
        isProcessEnv(n.expression) &&
        ts.isStringLiteralLike(n.argumentExpression) &&
        n.argumentExpression.text === "C2PA_MODE"
      ) {
        hits.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
        return;
      }
      // const { C2PA_MODE } = process.env
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        isProcessEnv(n.initializer) &&
        ts.isObjectBindingPattern(n.name) &&
        n.name.elements.some((el) => {
          const key = el.propertyName ?? el.name;
          return ts.isIdentifier(key) && key.text === "C2PA_MODE";
        })
      ) {
        hits.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
      }
    });
    return hits;
  }

  it("走査が実際に src/ と scripts/ の両方に届いている（陰性対照）", () => {
    const files = targets();
    // 走査が壊れて一部しか回らなくても「違反0件」で緑に見えてしまう。
    // **既知の1件で当たりを取る**（CLAUDE.md「自作の走査スクリプト…既知の1件で当たりを取る」）。
    expect(files, "正規化の実装そのものに届いていない＝走査が壊れている").toContain(OWNER);
    expect(files, "scripts/ の検査スクリプトに届いていない＝走査が src/ だけになっている").toContain(
      path.join(ROOT, "scripts", "check-c2pa-binary.mjs"),
    );
    // **直下の設定ファイルに届いていること。** ビルド時に評価されるので、ここの生の読みが
    // いちばん効く場所なのに、初版は走査していなかった（/code-review 指摘）。
    expect(files, "next.config.ts に届いていない＝ビルド時の読み手を見ていない").toContain(
      path.join(ROOT, "next.config.ts"),
    );
    // **モバイルにも届いていること。** 兄弟の走査（check-schema.mjs）は apps/mobile/src を対象にしている。
    expect(
      files.some((f) => f.startsWith(path.join(ROOT, "apps", "mobile", "src") + path.sep)),
      "apps/mobile/src に1件も届いていない",
    ).toBe(true);
    // 実数は 2500 件規模。桁を間違えた走査（`src/lib` だけ等）を弾くための下限。
    expect(files.length, "走査件数が実数から桁で外れている").toBeGreaterThan(1500);
    // 文字列の絞りが許可ファイルを落としていないこと（絞りが壊れると違反も拾えない）。
    const cands = candidates();
    for (const f of ALLOWED) {
      expect(cands, `${path.relative(ROOT, f)} が候補から落ちている＝絞りが壊れている`).toContain(f);
    }
    // 許可した2ファイルは、実際に読んでいる行を持っているはず（検出器が死んでいない証拠）。
    for (const f of ALLOWED) {
      expect(
        envReads(readFileSync(f, "utf8"), f).length,
        `${path.relative(ROOT, f)} の読みを検出できていない`,
      ).toBeGreaterThan(0);
    }
  });

  it("許可した2ファイル以外は C2PA_MODE を直接読まない", () => {
    const offenders: string[] = [];
    for (const file of candidates()) {
      if (ALLOWED.has(file)) continue;
      for (const line of envReads(readFileSync(file, "utf8"), file)) {
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }

    expect(
      offenders,
      [
        "C2PA_MODE を直接読んでいる箇所がある。`getMode()` を使うこと",
        '（`import { getMode as getC2paMode } from "@/lib/anchoring/providers/c2paMode"`）。',
        "生の読みは未知の値をそのまま下流に渡すので、綴り違いが黙って通る:",
        ...offenders,
      ].join("\n"),
    ).toEqual([]);
  });
});
