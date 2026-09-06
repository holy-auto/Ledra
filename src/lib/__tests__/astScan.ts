/**
 * 構造テスト用の構文木ヘルパー（テスト専用）。
 *
 * ## なぜ正規表現をやめたか
 *
 * 「呼んでいるか」は正規表現で書ける。「**効いているか**」は書けない。
 * 効いているかを問うということは、いつも**その文がその分岐の中にあるか**を
 * 問うことになるからで、これは入れ子構造の話であって文字列の話ではない。
 *
 * 実際に2巡ぶん、正規表現の継ぎ足しで追いかけて失敗した（MISTAKE_LEDGER M-033）。
 * 締めるたびに同じ穴が形を変えて出た。
 *
 * ```
 * if (limited) logger.warn(); return callModel();   // return が if の外
 * if (gate.ready) { logger.info(); } activate();     // 分岐が発行を包んでいない
 * if (a) { const v = f(); if (v) return v; } if (b) { const v = f(); }  // 同名・別スコープ
 * export const mutate = async () => { ... }          // function 宣言ではない
 * ```
 *
 * どれも木の上では一行で判定できる。`typescript` は既に依存に入っている。
 *
 * ## コメントについて
 *
 * 構文木はコメントを見ないので、`stripComments()` を通す必要が無い。
 * 「説明コメントに書いた関数名に検出器が反応する」事故（M-022）はここでは起きない。
 */
import ts from "typescript";
import { scriptKind } from "./sourceScan";

/**
 * ソースを構文木にする。**文法は拡張子で選ぶ。**
 * `.ts` を TSX として解くと総称のアロー関数が JSX と曖昧になり木が壊れる。
 * 既定を `.tsx` にしているのは、断片を直接渡す単体テストで JSX も書けるようにするため。
 */
export function parse(src: string, fileName = "scan.tsx"): ts.SourceFile {
  return ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, scriptKind(fileName));
}

/** 木を深さ優先で辿る。 */
export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** 条件に合う節点を集める。 */
export function collect<T extends ts.Node>(node: ts.Node, is: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  walk(node, (n) => {
    if (is(n)) out.push(n);
  });
  return out;
}

/**
 * **その文に入ったら必ず抜ける**（return / throw する）か。
 *
 * ガードが「効いている」の中身はこれ。`if (!ok) audit();` のように、条件は合っていても
 * 抜けない分岐は素通りである。ブロックなら中の文が1つでも無条件に抜ければ抜ける。
 * 入れ子の `if` は「必ず」ではないので数えない。
 */
export function alwaysExits(stmt: ts.Statement | undefined): boolean {
  if (!stmt) return false;
  if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  if (ts.isBlock(stmt)) return stmt.statements.some(alwaysExits);
  return false;
}

/** `export` が付いているか。 */
export function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

export type NamedFunction = {
  name: string;
  exported: boolean;
  /** 本文。宣言だけ（オーバーロード等）なら undefined。 */
  body: ts.Node | undefined;
};

/**
 * ファイル内の名前付き関数を集める。**`export const f = async () => {}` も同じ一覧に載せる。**
 *
 * `function` 宣言だけを見ていたので、アロー関数で書いた Server Action が
 * まるごと検査対象から消えていた（Codex の指摘）。
 */
export function namedFunctions(sf: ts.SourceFile): NamedFunction[] {
  const out: NamedFunction[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({ name: stmt.name.text, exported: isExported(stmt), body: stmt.body });
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      const exported = isExported(stmt);
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const init = decl.initializer;
        const fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined;
        if (fn) out.push({ name: decl.name.text, exported, body: fn.body });
      }
    }
  }
  return out;
}

/** `f()` / `await f()` / `a.f()` の呼ばれている名前。取れなければ null。 */
export function calleeName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** その節点の中で `name(...)` が呼ばれているか。 */
export function calls(node: ts.Node, name: string): boolean {
  return collect(node, ts.isCallExpression).some((c) => calleeName(c) === name);
}

/** `await x` を剥がす。 */
export function unwrapAwait(e: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(e) ? e.expression : e;
}

/**
 * **直列に並んだ文のリスト**を全部返す（ファイル直下・ブロック・case 節）。
 *
 * 「代入の**後**に、**同じスコープ**でガードしているか」を見るために要る。
 * 変数名だけで全体を検索すると、別のブロックの同名変数のガードを流用してしまい、
 * 守られていない呼び出しが守られていることになる（Codex の指摘）。
 */
export function statementLists(node: ts.Node): ts.Statement[][] {
  const out: ts.Statement[][] = [];
  walk(node, (n) => {
    if (ts.isSourceFile(n) || ts.isBlock(n)) out.push([...n.statements]);
    else if (ts.isCaseClause(n) || ts.isDefaultClause(n)) out.push([...n.statements]);
  });
  return out;
}

/** `const v = <式>` の形の宣言を、変数名と初期化式で返す。 */
export function declarationOf(stmt: ts.Statement): { name: string; init: ts.Expression } | null {
  if (!ts.isVariableStatement(stmt)) return null;
  const decl = stmt.declarationList.declarations[0];
  if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) return null;
  return { name: decl.name.text, init: decl.initializer };
}

/**
 * `rest` の中に「条件が `match` に当たり、かつ**必ず抜ける**」`if` があるか。
 *
 * ガードが効いていることの最小の形。`else` は見ない（早期 return の形だけを認める）。
 */
export function hasExitingGuard(stmts: readonly ts.Statement[], match: (cond: ts.Expression) => boolean): boolean {
  return stmts.some((s) => ts.isIfStatement(s) && match(s.expression) && alwaysExits(s.thenStatement));
}

/**
 * `stmts` の中に「条件が `match` に当たり、その**分岐の中に** `inside` がある」`if` があるか。
 *
 * 「弾く」ではなく「**その条件のときだけ実行する**」形を認めるために要る。
 * 分岐の存在だけを見ると `if (ok) { log(); } doIt();` が通ってしまう。
 */
export function hasEnclosingGuard(
  stmts: readonly ts.Statement[],
  match: (cond: ts.Expression) => boolean,
  inside: (body: ts.Statement) => boolean,
): boolean {
  return stmts.some((s) => ts.isIfStatement(s) && match(s.expression) && inside(s.thenStatement));
}

/** 識別子 `name` そのものを指しているか（`v`）。 */
export function isIdent(e: ts.Expression, name: string): boolean {
  return ts.isIdentifier(e) && e.text === name;
}

/** `!<式>` を剥がす。否定でなければ null。 */
export function negated(e: ts.Expression): ts.Expression | null {
  return ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken ? e.operand : null;
}

/** `v.prop` を指しているか。 */
export function isPropertyOf(e: ts.Expression, name: string, prop: string): boolean {
  return ts.isPropertyAccessExpression(e) && isIdent(e.expression, name) && e.name.text === prop;
}

/**
 * 副作用（書き込み）の呼び出し位置のうち、**いちばん早いもの**。無ければ Infinity。
 *
 * 「守っている」は**守ってから書く**の意味であって、本文のどこかにガードがあることではない。
 * `await write(); if (!requirePermission(...)) return forbidden;` は書き込んだ後に弾いており、
 * 認可の意味を成していない（Codex の指摘）。
 *
 * ponytail: 書き込みの見分けは名前と Supabase のクエリビルダに限った素朴な判定。
 * 取りこぼす形が出たら、副作用の入口を1箇所に集約してそこを見る方が確実。
 */
const WRITE_NAMES = /^(insert|update|upsert|delete|remove|create|write|revalidatePath|revalidateTag)$/;

export function firstSideEffectPos(node: ts.Node): number {
  const positions = collect(node, ts.isCallExpression)
    .filter((c) => {
      const name = calleeName(c);
      if (name !== null && WRITE_NAMES.test(name)) return true;
      // `admin.from("t").update(...)` の起点。読み書きの区別が付かないので from も見る。
      return name === "from";
    })
    .map((c) => c.getStart());
  return positions.length ? Math.min(...positions) : Number.POSITIVE_INFINITY;
}
