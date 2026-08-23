// モバイルの Supabase クエリが実スキーマと合っているかの自己チェック。
// 実行: node apps/mobile/src/lib/schema.check.ts
//
// なぜ要るか: supabase-js のクエリはただの文字列で、型チェックも lint も通る。
// 存在しない列や関係を書くと PostgREST がクエリごと 400 を返し、画面は
// 「まだ登録されていません」と表示する（データはあるのに）。
// 実際に 13 画面・27 箇所がこの状態で、車両一覧が何も出ない不具合になっていた。
//
// **読めないトークンは「たぶん大丈夫」ではなく失敗として扱う。**
// 最初の版は正規表現に合わないトークンを黙って飛ばしており、select 文字列の中に
// 書いてしまった `//` コメント（PostgREST にそのまま送られて 400 になる）を
// 5 箇所すべて見逃した。分からないものを通す検査は検査ではない。
//
// ponytail: 上限。schema.snapshot.json は実 DB から取った時点のコピーなので、
// マイグレーションで列を足したら更新が要る（手順は README）。
// 本来は `npm run db:typegen` の生成型でクエリを型付けするのが筋。
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const schema: Record<string, string[]> = JSON.parse(
  readFileSync(resolve(here, "schema.snapshot.json"), "utf8"),
);
const cols = new Map(Object.entries(schema).map(([t, c]) => [t, new Set(c)]));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".check.ts")) out.push(p);
  }
  return out;
}

const issues: string[] = [];
const add = (where: string, what: string) => issues.push(`  ${where}  ${what}`);

/** select 文字列を走査する。埋め込み `alias:table ( ... )` は再帰的に見る */
function checkSelect(sel: string, table: string, where: string): void {
  const have = cols.get(table);
  if (!have) {
    add(where, `テーブル ${table} が存在しない`);
    return;
  }
  let i = 0;
  let depth = 0;
  let buf = "";
  const tokens: string[] = [];
  while (i < sel.length) {
    const c = sel[i];
    if (c === "(") {
      if (depth === 0) {
        let j = i;
        let d = 0;
        while (j < sel.length) {
          if (sel[j] === "(") d++;
          else if (sel[j] === ")") {
            d--;
            if (d === 0) break;
          }
          j++;
        }
        // "alias:table" / "table!fk" のどちらでも実テーブル名を取り出す
        const head = buf.trim();
        const name = head.split(":").pop()!.split("!")[0].trim();
        if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
          add(where, `埋め込み名を解釈できない: ${JSON.stringify(head)}`);
        } else {
          checkSelect(sel.slice(i + 1, j), name, where);
        }
        buf = "";
        i = j + 1;
        continue;
      }
      depth++;
    } else if (depth === 0 && c === ",") {
      tokens.push(buf);
      buf = "";
    } else {
      buf += c;
    }
    i++;
  }
  tokens.push(buf);
  for (const t of tokens) {
    const raw = t.trim();
    if (!raw || raw.includes("(")) continue;
    if (raw === "*") continue;
    const col = raw.split(":").pop()!.split("::")[0].trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(col)) {
      // ここに来るのは select 文字列にコメントや式が混ざっている場合。
      // postgrest-js は空白を除くだけで中身をそのまま送るため、必ず 400 になる
      add(where, `列として読めない: ${JSON.stringify(raw)}`);
      continue;
    }
    if (!have.has(col)) add(where, `${table}.${col} が存在しない`);
  }
}

/** insert / update / upsert のオブジェクトリテラルのキーを見る */
function checkMutation(body: string, table: string, where: string): void {
  const have = cols.get(table);
  if (!have) {
    add(where, `テーブル ${table} が存在しない`);
    return;
  }
  // トップレベルのキーだけ拾う（ネストした値の中のキーは列ではない）
  let depth = 0;
  let atKey = true;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (depth === 0 && c === ":") {
      if (atKey) {
        const key = buf.trim().replace(/^["']|["']$/g, "");
        if (/^[a-z_][a-z0-9_]*$/.test(key) && !have.has(key)) {
          add(where, `${table}.${key} が存在しない（書き込み）`);
        }
      }
      atKey = false;
      buf = "";
      continue;
    } else if (depth === 0 && c === ",") {
      atKey = true;
      buf = "";
      continue;
    }
    if (depth === 0) buf += c;
  }
}

const SELECT = /\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,500}?)\.select\(\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(["'`])([\s\S]*?)\3/g;
const MUTATE = /\.from\(\s*["'`](\w+)["'`]\s*\)\s*\.(insert|update|upsert)\(\s*\{/g;

/** 対応する閉じ括弧までを返す */
function balanced(src: string, openIdx: number): string {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") {
      d--;
      if (d === 0) return src.slice(openIdx + 1, i);
    }
  }
  return "";
}

let selects = 0;
let mutations = 0;
// src 配下すべてを見る（lib のログイン処理など app/ の外にもクエリがある）
for (const file of walk(join(appRoot))) {
  const txt = readFileSync(file, "utf8");
  const rel = (idx: number) => `${relative(appRoot, file)}:${txt.slice(0, idx).split("\n").length}`;
  for (const m of txt.matchAll(SELECT)) {
    selects++;
    checkSelect(m[4].replace(/\s+/g, " "), m[1], rel(m.index!));
  }
  for (const m of txt.matchAll(MUTATE)) {
    mutations++;
    checkMutation(balanced(txt, txt.indexOf("{", m.index! + m[0].length - 1)), m[1], rel(m.index!));
  }
}

// 検出数が急に減ったら正規表現が古くなっている。0 件は必ず異常
assert.ok(selects >= 55, `select の検出が ${selects} 件しかない（正規表現が古い可能性）`);
assert.ok(mutations >= 5, `insert/update の検出が ${mutations} 件しかない（正規表現が古い可能性）`);

assert.deepEqual(
  issues,
  [],
  "実スキーマに合わない箇所があります:\n" +
    issues.join("\n") +
    "\nスキーマを変えた場合は src/lib/schema.snapshot.json を更新してください。",
);

console.log(`schema self-check: OK (select ${selects} 件 / 書き込み ${mutations} 件)`);
