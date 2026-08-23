// モバイルの Supabase クエリが実スキーマと合っているかの自己チェック。
// 実行: node apps/mobile/src/lib/schema.check.ts
//
// なぜ要るか: supabase-js のクエリはただの文字列で、型チェックも lint も通る。
// 存在しない列や関係を書くと PostgREST がクエリごと 400 を返し、画面は
// 「まだ登録されていません」と表示される（データはあるのに）。
// 実際に 13 画面・27 箇所がこの状態で、車両一覧が何も出ない不具合になっていた。
//
// ponytail: 上限。schema.snapshot.json は実 DB から取った時点のコピーなので、
// マイグレーションで列を足したら更新が要る。更新方法は snapshot の隣に書いてある。
// 本来は `npm run db:typegen` の生成型でクエリを型付けするのが筋だが、
// 生成型は未コミットで Metro もアプリ外を解決しないため、まずこの照合で止める。
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

interface Issue {
  where: string;
  what: string;
}
const issues: Issue[] = [];

/** select 文字列を走査する。埋め込み `alias:table ( ... )` は再帰的に見る */
function checkSelect(sel: string, table: string, where: string): void {
  const have = cols.get(table);
  if (!have) {
    issues.push({ where, what: `テーブル ${table} が存在しない` });
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
        const name = buf.trim().split(":").pop()!.split("!")[0].trim();
        if (name) checkSelect(sel.slice(i + 1, j), name, where);
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
    if (!raw || raw === "*" || raw.includes("(")) continue;
    const col = raw.split(":").pop()!.split("::")[0].trim();
    if (/^[a-z_][a-z0-9_]*$/.test(col) && !have.has(col)) {
      issues.push({ where, what: `${table}.${col} が存在しない` });
    }
  }
}

const QUERY = /\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,500}?)\.select\(\s*(["'`])([\s\S]*?)\3/g;
let scanned = 0;
for (const file of walk(join(appRoot, "app")).concat(walk(join(appRoot, "hooks")))) {
  const txt = readFileSync(file, "utf8");
  for (const m of txt.matchAll(QUERY)) {
    scanned++;
    const line = txt.slice(0, m.index).split("\n").length;
    checkSelect(m[4].replace(/\s+/g, " "), m[1], `${relative(appRoot, file)}:${line}`);
  }
}

assert.ok(scanned > 0, "クエリを1件も検出できていない（正規表現が古い可能性）");
assert.deepEqual(
  issues,
  [],
  "実スキーマに無い列・テーブルを参照しています:\n" +
    issues.map((i) => `  ${i.where}  ${i.what}`).join("\n") +
    "\nスキーマを変えた場合は src/lib/schema.snapshot.json を更新してください。",
);

console.log(`schema self-check: OK (${scanned} クエリ)`);
