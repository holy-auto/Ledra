#!/usr/bin/env node
/**
 * 戻り値を受け取らない DB 書き込みを落とす検査。
 *
 * ## なぜ要るか
 *
 * Supabase の書き込みは失敗を例外ではなく `{ error }` で返す。
 * `await admin.from("x").insert(...)` と書くと**失敗が誰にも届かない**。
 * 2026-10-10 にヒアリング連携で実害が出た（画面には「成功」、DB には何も無い。
 * MISTAKE_LEDGER `M-20261010-showed-success-while-dropping-three-db-errors`）。
 * そのとき `src/` 全体を数えたら**同じ形が 276 件**あった。
 *
 * 代表判断（2026-10-12「全部修正しろ」）で**276 件すべてを直した**ので、この検査は
 * 0 件を維持する。**除外リストは置かない** —— 置くと「後で直す」が溜まる場所になる。
 *
 * ## 直し方は2つだけ
 *
 *   1. 失敗が利用者の操作の成否を変えるなら → `const { error } = await ...` で受けて返す／throw
 *   2. 失敗しても操作は完了しているなら → `bestEffortWrite(op, "理由")`（ログに出る）
 *
 * ## 検出の限界（ponytail）
 *
 * 行頭が `await` の文だけを見る。`await Promise.all([...書き込み...])` の中身や、
 * promise を変数に入れてから捨てる書き方は見ない（実測でこの形は少数）。
 * 上げるなら TypeScript の AST で「式文として捨てられた PromiseLike」を見るのが筋。
 *
 * 走らせ方: node scripts/check-unchecked-db-writes.mjs
 *          node scripts/check-unchecked-db-writes.mjs --selftest   ← 検出器自身の検査
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["src"];

/**
 * 行頭 `await <client>.from(` で始まり、`;` までの1文。
 *
 * **クライアントの連鎖で始まる文だけを見る。** `await run(() => admin.from(...))` のように
 * 書き込みを関数へ渡す形は、渡した先がエラーを見ている（`src/lib/messages/threads.ts` の
 * `run()` は throw する）。そこまで追えないので、最初から対象にしない。
 * これを緩めて「文のどこかに `.from(` があれば」にすると、2026-10-12 に実際に
 * 3件を誤検出して自動修正で構文を壊した。
 */
const STMT = /^[ \t]*await\s+[A-Za-z_$][\w$]*(?:\(\))?\s*(?:\r?\n\s*)?\.from\([\s\S]{0,800}?;/gm;
/** 書き込みの呼び出し。 */
const WRITE = /\.(insert|update|upsert|delete)\(/;
/** `.from("table")` —— Supabase のクエリであることの印。 */
const FROM = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/;
/** 結果を自分で扱っている印。これがあれば捨てていない。 */
const HANDLED = /\bbestEffortWrite\s*\(|\.then\s*\(|\.catch\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 1ファイルから、捨てられている書き込みの一覧を返す。 */
export function findUncheckedWrites(source, file = "<memory>") {
  const hits = [];
  for (const m of source.matchAll(STMT)) {
    const stmt = m[0];
    if (!WRITE.test(stmt)) continue;
    const from = FROM.exec(stmt);
    if (!from) continue;
    if (HANDLED.test(stmt)) continue;
    hits.push({
      file,
      line: source.slice(0, m.index).split("\n").length,
      table: from[1],
      stmt: stmt.replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return hits;
}

function selftest() {
  const cases = [
    // [名前, ソース, 期待する件数]
    ["捨てている insert", `await admin.from("a").insert({ x: 1 });`, 1],
    ["捨てている update（複数行）", `await admin\n  .from("a")\n  .update({ x: 1 })\n  .eq("id", id);`, 1],
    ["受け取っている", `const { error } = await admin.from("a").insert({ x: 1 });`, 0],
    ["bestEffortWrite で包んだ", `await bestEffortWrite(admin.from("a").insert({ x: 1 }), "a insert");`, 0],
    ["then で扱っている", `await admin.from("a").delete().eq("id", id).then(undefined, (e) => log(e));`, 0],
    ["読み取りだけ", `await admin.from("a").select("id").eq("id", id);`, 0],
    ["storage は対象外", `await admin.storage.from("bucket").remove(paths);`, 0],
    // 2026-10-12 の誤検出。書き込みを関数へ渡す形は、渡した先が見ている。
    ["関数に渡している（run が throw する）", `await run(() => admin.from("a").update({ x: 1 }).eq("id", id));`, 0],
    ["admin() のように関数で取るクライアント", `await admin().from("a").update({ x: 1 }).eq("id", id);`, 1],
    [
      "ヒアリング連携の修正前の形（既知の1件）",
      `await supabase\n  .from("hearings")\n  .update({ customer_id: customer.id, status: "linked" })\n  .eq("id", id);`,
      1,
    ],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = findUncheckedWrites(src).length;
    if (got !== want) {
      console.error(`  ✗ ${name}: ${got} 件（期待 ${want} 件）`);
      bad++;
    } else {
      console.log(`  ✓ ${name}`);
    }
  }
  if (bad > 0) {
    console.error(`\ncheck-unchecked-db-writes: 自己検査が ${bad} 件落ちた。検出器が壊れている`);
    process.exit(1);
  }
  console.log(`check-unchecked-db-writes: 自己検査 OK（${cases.length} 件）`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const hits = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    for (const h of findUncheckedWrites(readFileSync(f, "utf8"), rel)) {
      hits.push(h);
    }
  }

  if (hits.length > 0) {
    console.error(`❌ 戻り値を受け取らない DB 書き込みが ${hits.length} 件あります:\n`);
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  (${h.table})`);
      console.error(`      ${h.stmt}`);
    }
    console.error(
      `\n直し方は2つ。失敗が利用者の操作の成否を変えるなら \`const { error } = await ...\` で受けて返す。` +
        `\n落ちても操作は完了しているなら \`bestEffortWrite(op, "理由")\` で包む（失敗がログに出る）。` +
        `\n**除外リストは無い。** 0 件まで直し切ってあるので、増やさないこと。`,
    );
    process.exit(1);
  }

  console.log(`check-unchecked-db-writes: OK（${files.length} ファイル・該当 0 件）`);
}

main();
