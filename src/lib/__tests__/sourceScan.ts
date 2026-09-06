/**
 * 構造テスト用のソース走査ヘルパー（テスト専用。vitest の include は *.test.ts のみ）。
 *
 * 同じ walk が3ファイルに複製されていたので1箇所に集約した。
 * 除外リスト（__tests__ / node_modules）を変えるときに1箇所で済む。
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * コメントを落とす。**構造テストは必ずこれを通してから照合すること。**
 *
 * 検出器が説明コメントに書いた関数名へ反応し、実際のガードを消しても緑のまま —— を
 * この repo は2回やっている（MISTAKE_LEDGER M-022、および serverActionGuards の
 * `hasMinRole(role, "staff")` の引用）。同じ実装が2ファイルに複製されていたので集約した。
 *
 * ponytail: 文字列リテラル中の `//` も落とす素朴な実装。対象は本リポジトリの
 * ソースなので実用上は足りる。誤判定が出たら TypeScript の AST に置き換える。
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
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
