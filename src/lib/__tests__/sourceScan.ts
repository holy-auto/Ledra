/**
 * 構造テスト用のソース走査ヘルパー（テスト専用。vitest の include は *.test.ts のみ）。
 *
 * 同じ walk が3ファイルに複製されていたので1箇所に集約した。
 * 除外リスト（__tests__ / node_modules）を変えるときに1箇所で済む。
 */
import ts from "typescript";

/**
 * 拡張子で文法を選ぶ。**`.ts` を TSX として解いてはいけない。**
 * `const f = <T,>(x: T) => x` のような総称のアロー関数が JSX と曖昧になり、
 * 構文木が壊れてその先のコメントを取りこぼす（Codex の指摘）。
 */
export function scriptKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * コメントを落とす。**構造テストは必ずこれを通してから照合すること。**
 *
 * 検出器が説明コメントに書いた関数名へ反応し、実際のガードを消しても緑のまま —— を
 * この repo は2回やっている（MISTAKE_LEDGER M-022 ほか）。同じ実装が2ファイルに
 * 複製されていたので集約した。
 *
 * **自前の正規表現をやめ、TypeScript のスキャナで落とす。** 行頭の `//` だけを見る
 * 実装だったので、`void 0; // const limited = await checkRateLimit(...)` のような
 * **行末コメント**が残り、そこに書かれた呼び出しを検出器が本物と読んだ（Codex の指摘）。
 * 逆に素朴に `//` を全部消すと `"https://..."` の中まで壊す。字句解析なら
 * 文字列・テンプレート・正規表現リテラルの中身を壊さずにコメントだけを落とせる。
 *
 * 行番号がずれないよう、コメントは改行だけ残して空白化する。
 */
export function stripComments(src: string, fileName = "scan.tsx"): string {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const ranges: { pos: number; end: number }[] = [];
  const visit = (node: ts.Node): void => {
    // 前置と後置の両方を取る。**同じ行にあるコメントは前置に出てこない**ので、
    // 前置だけ見ていると `void 0; // ...` の行末コメントが丸ごと残る。
    for (const r of ts.getLeadingCommentRanges(src, node.getFullStart()) ?? []) ranges.push(r);
    for (const r of ts.getTrailingCommentRanges(src, node.getEnd()) ?? []) ranges.push(r);
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);

  // **文字列で切り貼りする。** `[...src]` はコードポイント単位の配列になるが、
  // TypeScript が返す pos/end は **UTF-16 単位**。絵文字が1つでも手前にあると
  // 位置がずれ、コメントが残ったり本物のコードを潰したりする（Codex の指摘）。
  const sorted = [...ranges].sort((a, b) => a.pos - b.pos);
  let out = "";
  let at = 0;
  for (const { pos, end } of sorted) {
    if (end <= at) continue; // 入れ子・重複
    const from = Math.max(pos, at);
    out += src.slice(at, from) + src.slice(from, end).replace(/[^\n]/g, " "); // 行番号を保つ
    at = end;
  }
  return out + src.slice(at);
}

/** ディレクトリ配下の .ts/.tsx を再帰的に集める。 */
export function walkSource(dir: string, filter: (name: string) => boolean = isTsFile, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walkSource(p, filter, out);
    } else if (filter(name)) {
      out.push(p);
    }
  }
  return out;
}

export function isTsFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

/** 関数の開始（宣言・アロー・メソッド）を拾う。 */
const FUNCTION_START = /\b(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{|\)\s*=>\s*\{/g;

/**
 * `needle` に一致する箇所それぞれについて、それを含む**最も内側の関数の本文**を返す。
 *
 * ファイル全体を対象に文字列一致で権限チェックの有無を見ると、同じファイル内の
 * 別目的の呼び出し（例: ボタンの出し分け用に画面トップで権限を評価している行）を
 * 拾ってしまい、肝心の書き込み関数からガードが消えても検出できない。
 * 実際にそれで検出漏れを起こしたので、関数単位に切って判定する。
 *
 * ponytail: 波括弧の対応だけを見る簡易実装で、文字列リテラル中の `{` `}` は数える。
 * 対象は本リポジトリの route.tsx / page.tsx なので実用上は足りている。
 * 誤判定が出たら TypeScript の AST（ts.createSourceFile）に置き換える。
 */
export function enclosingFunctions(src: string, needle: RegExp): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(needle)) {
    const at = m.index ?? 0;
    const starts = [...src.slice(0, at).matchAll(FUNCTION_START)];
    if (!starts.length) {
      out.push(src); // 関数の外（モジュールトップレベル）
      continue;
    }
    const s = starts[starts.length - 1];
    const open = (s.index ?? 0) + s[0].length - 1;
    let depth = 0;
    let end = src.length;
    for (let k = open; k < src.length; k++) {
      if (src[k] === "{") depth++;
      else if (src[k] === "}") {
        depth--;
        if (depth === 0) {
          end = k + 1;
          break;
        }
      }
    }
    out.push(src.slice(s.index ?? 0, end));
  }
  return out;
}

/**
 * route.ts を HTTP メソッド別のハンドラ本文に切る。
 *
 * ファイル全体を対象にガードの有無を見ると、同じファイルの別ハンドラのガードを
 * 拾って素通りする。実際 `admin/invoices` は DELETE だけが admin 以上で POST/PUT が
 * 素通りだったのに「強制済み」に数えられていた（2026-09-01）。
 *
 * `export const POST = withX(handler)` のように**名前付き関数を包んで export** する形は、
 * 実体がこの split の**前**に来るため、どのメソッドにも属さない断片として残る。
 * 呼び出し側はその断片（`split()` の先頭要素）も見ること。
 * 実際 `qstash/line-history-import` がこの形で、メソッド単位だけを見ると消える。
 */
export function handlerChunks(src: string): Map<string, string> {
  const split =
    /(?=export\s+(?:async\s+)?(?:function\s+(?:GET|POST|PUT|PATCH|DELETE)\b|const\s+(?:GET|POST|PUT|PATCH|DELETE)\s*=))/;
  const named = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/;
  const out = new Map<string, string>();
  for (const part of src.split(split)) {
    const m = part.match(named);
    if (m) out.set(m[1], part);
  }
  return out;
}

/** どの export ハンドラにも属さない先頭断片（名前付き関数を包んで export する形の実体）。 */
export function moduleChunk(src: string): string {
  const split =
    /(?=export\s+(?:async\s+)?(?:function\s+(?:GET|POST|PUT|PATCH|DELETE)\b|const\s+(?:GET|POST|PUT|PATCH|DELETE)\s*=))/;
  const named = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/;
  const first = src.split(split)[0] ?? "";
  return named.test(first) ? "" : first;
}
