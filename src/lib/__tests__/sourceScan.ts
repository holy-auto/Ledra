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
  return enclosingFunctionsWithPos(src, needle).map((h) => h.body);
}

/**
 * `enclosingFunctions` と同じものを、**一致した位置**付きで返す。
 *
 * ラッパに預けた認可（`withCaller(handler, { permission })`）は書き込み関数の
 * **外側**に出るため、本文だけでは見えない。位置が分かれば
 * 「その書き込みを包んでいるラッパ呼び出し」を特定できる（`wrapperCalls`）。
 */
export function enclosingFunctionsWithPos(src: string, needle: RegExp): { pos: number; body: string }[] {
  const out: { pos: number; body: string }[] = [];
  for (const m of src.matchAll(needle)) {
    const at = m.index ?? 0;
    const starts = [...src.slice(0, at).matchAll(FUNCTION_START)];
    if (!starts.length) {
      out.push({ pos: at, body: src }); // 関数の外（モジュールトップレベル）
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
    out.push({ pos: at, body: src.slice(s.index ?? 0, end) });
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

/**
 * ラッパ関数（`withCaller` 等）の**オプション引数**に書かれた認可・レート制限を読む。
 *
 * なぜ要るか: 378 本のルートを `withCaller(handler, { permission: "x:y" })` へ寄せた
 * 結果、ハンドラ本文から `!requirePermission(...)` が消えた。本文だけを見ていた検出器は
 * **登録ルート 144 件を「未強制」と誤検出し、同時に withCaller 包みのルートを丸ごと
 * 見失った**（2026-09-18）。見失った側が重い —— 認可もレート制限も持たないルートが
 * 検出器の視界の外に出て、赤にならないまま増やせる状態だった。
 *
 * **ラッパを信用してよい根拠は `src/lib/api/__tests__/withCaller.test.ts`。**
 * あそこが値の水準で「未認証なら 401」「minRole 不足なら 403」「permission 不足なら 403」
 * 「rateLimit に達したらハンドラを呼ばない」を固定している。withCaller から分岐を
 * 抜けば**あの検査が落ちる**ので、ここだけが緑になることはない。
 *
 * **ラッパ呼び出しの引数の中だけを見る（構文木）。** ファイル全体を正規表現で引くと、
 * 説明コメントや別目的のオブジェクトリテラルを認可と読む（型 D「移設で弱める」）。
 * 変数で渡す形（`withCaller(h, opts)`・`{ permission }` の短縮）は**読めないので数えない** ——
 * 分からないものを認可として通すと、検出器が嘘をつく側に倒れる。
 */
export type WrapperGuards = {
  /** ラッパで包まれている = ラッパが caller を解決している。 */
  wrapped: boolean;
  permissions: Set<string>;
  minRoles: Set<string>;
  rateLimits: Set<string>;
};

/** caller を解決するラッパの名前。増えたらここに足す。 */
export const CALLER_WRAPPERS = ["withCaller"] as const;

/** ラッパ呼び出し1つ。`start`/`end` はソース上の範囲（包まれている位置の判定に使う）。 */
export type WrapperCall = {
  start: number;
  end: number;
  permissions: Set<string>;
  minRoles: Set<string>;
  rateLimits: Set<string>;
};

/** ラッパ呼び出しを**範囲付き**で全部返す。 */
export function wrapperCalls(
  src: string,
  fileName = "scan.ts",
  wrappers: readonly string[] = CALLER_WRAPPERS,
): WrapperCall[] {
  const out: WrapperCall[] = [];
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));

  const literal = (e: ts.Expression): string | null => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    return null;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      // `withCaller(...)` と `withCaller<{ id: string }>(...)` の両方。
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (callee && wrappers.includes(callee)) {
        const call: WrapperCall = {
          start: node.getStart(sf),
          end: node.getEnd(),
          permissions: new Set(),
          minRoles: new Set(),
          rateLimits: new Set(),
        };
        out.push(call);
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const prop of arg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue; // 短縮形・スプレッドは読めない
            const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
            const value = literal(prop.initializer);
            if (!key || value === null) continue;
            if (key === "permission") call.permissions.add(value);
            else if (key === "minRole") call.minRoles.add(value);
            else if (key === "rateLimit") call.rateLimits.add(value);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** そのソース断片に出てくるラッパのオプションをまとめたもの。 */
export function wrapperGuards(
  src: string,
  fileName = "scan.ts",
  wrappers: readonly string[] = CALLER_WRAPPERS,
): WrapperGuards {
  const calls = wrapperCalls(src, fileName, wrappers);
  return {
    wrapped: calls.length > 0,
    permissions: new Set(calls.flatMap((c) => [...c.permissions])),
    minRoles: new Set(calls.flatMap((c) => [...c.minRoles])),
    rateLimits: new Set(calls.flatMap((c) => [...c.rateLimits])),
  };
}
