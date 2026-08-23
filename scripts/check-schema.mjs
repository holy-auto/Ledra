// Supabase のクエリが実スキーマと合っているかの照合。Web とモバイルの両方を見る。
// 実行: node scripts/check-schema.mjs   （npm run check:schema）
//
// なぜ要るか: supabase-js のクエリはただの文字列で、型チェックも lint も通る。
// 存在しない列や関係を書くと PostgREST がクエリごと 400 を返し、画面は
// 「まだ登録されていません」と表示する（データはあるのに）。
// モバイルで 13 画面・27 箇所がこの状態で、車両一覧が空になる不具合になっていた。
//
// **読めないトークンは「たぶん大丈夫」ではなく失敗として扱う。**
// 最初の版は正規表現に合わないトークンを黙って飛ばしており、select 文字列の中に
// 書いてしまった `//` コメント（PostgREST にそのまま送られて 400 になる）を
// 5 箇所すべて見逃した。分からないものを通す検査は検査ではない。
//
// ponytail: 上限その1。schema.snapshot.json は実 DB から取った時点のコピーなので、
// マイグレーションで列を足したら更新が要る（手順は schema.snapshot.README.md）。
// 本来は `npm run db:typegen` の生成型でクエリを型付けするのが筋。
import assert from "node:assert";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const schema = JSON.parse(readFileSync(join(repoRoot, "scripts/schema.snapshot.json"), "utf8"));
const cols = new Map(Object.entries(schema).map(([t, c]) => [t, new Set(c)]));

// 走査対象と、そこにあるはずのクエリ数の下限。0 件は必ず異常で、
// 大きく減ったら正規表現が実装の書き方に追いつけていない
const TARGETS = [
  { dir: "src", minSelects: 2000, minMutations: 800 },
  { dir: "apps/mobile/src", minSelects: 55, minMutations: 5 },
  // 運用スクリプトも実 DB を触る。役目を終えた平文シークレットのバックフィルが
  // 削除済み列を参照したまま残っていたので、ここも対象に入れる
  { dir: "scripts", minSelects: 0, minMutations: 0 },
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const issues = [];
const add = (where, what) => issues.push(`  ${where}  ${what}`);

/**
 * 列やペイロードを `.map()` などで組み立てていて**中身を読めなかった**クエリ。
 * これを黙って飛ばしていたせいで、壊れたクエリが4箇所そのまま通っていた。
 * かといって全部落とすと、正当な書き方（配列を map で作る insert）が止まる。
 * **件数を記録して、増えたら落とす。**減らすには対象を const に括り出すか
 * 文字列で書く。
 * ponytail: 上限。生成型 (db:typegen) でクエリを型付けすれば、この枠は要らなくなる。
 */
const unresolved = [];
const UNRESOLVED_BASELINE = 54;
const addUnresolved = (where, what) => unresolved.push(`  ${where}  ${what}`);

/** select 文字列を走査する。埋め込み `alias:table ( ... )` は再帰的に見る */
function checkSelect(sel, table, where) {
  const have = cols.get(table);
  if (!have) {
    add(where, `テーブル ${table} が存在しない`);
    return;
  }
  let i = 0;
  let depth = 0;
  let buf = "";
  const tokens = [];
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
        checkEmbed(buf.trim(), sel.slice(i + 1, j), table, where);
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
    const col = raw.split(":").pop().split("::")[0].trim();
    // PostgREST の集計。certificate_images(count) は件数取得で、列名ではない
    if (col === "count") continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(col)) {
      // ここに来るのは select 文字列にコメントや式が混ざっている場合。
      // postgrest-js は空白を除くだけで中身をそのまま送るため、必ず 400 になる
      add(where, `列として読めない: ${JSON.stringify(raw)}`);
      continue;
    }
    if (!have.has(col)) add(where, `${table}.${col} が存在しない`);
  }
}

/**
 * 埋め込みの見出し（`alias:target!hint` / `target!hint` / `target`）から
 * 実テーブルを決める。PostgREST は target に **FK の列名** も書けるので
 * （`tenants:tenant_id(name)`）、target がテーブルでなければ別名で引き直す。
 *
 * ponytail: 上限その2。別名も列名も実テーブル名と違う書き方
 * （`t:tenant_id(...)`）は解決できないので、通さずに報告する。
 * 実際にそう書かれた箇所が増えたら、FK の対応表をスナップショットに足す。
 */
function checkEmbed(head, body, parent, where) {
  const parts = head.split(":");
  const target = parts.pop().split("!")[0].trim();
  const alias = parts.length ? parts.join(":").trim() : "";
  const ok = (n) => /^[a-z_][a-z0-9_]*$/.test(n) && cols.has(n);
  if (ok(target)) {
    checkSelect(body, target, where);
    return;
  }
  // target がテーブルでないなら FK 列名で埋め込む形（tenants:tenant_id(...)）。
  // 別名の側でテーブルを引き直し、列が親に無ければ誤り
  if (!ok(alias)) {
    add(where, `埋め込み先を解決できない: ${JSON.stringify(head)}`);
    return;
  }
  if (!cols.get(parent)?.has(target)) {
    add(where, `${parent}.${target} が存在しない（埋め込み ${JSON.stringify(head)}）`);
    return;
  }
  checkSelect(body, alias, where);
}

/** insert / update / upsert のオブジェクトリテラルのキーを見る */
function checkMutation(body, table, where) {
  const have = cols.get(table);
  if (!have) {
    add(where, `テーブル ${table} が存在しない（書き込み）`);
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

// `.from("x")` と `.select(...)` の間に別の `.from(` を挟ませない。
// 挟ませると `.from("a").update(...)` の直後に来る `.from("b").select(...)` を
// 取り違え、無関係な表の列として報告してしまう（実際に3件そうなった）
const SELECT =
  /\.from\(\s*["'`](\w+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,500}?)\.select\(\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(["'`])([\s\S]*?)\3/g;
// 列を**変数**で渡す形（.select(selectCols)）。値を解決できないと素通りするので
// 別に拾って、解決できなければ「読めない」として落とす。
// これを見ていなかったせいで、実際に4箇所の壊れたクエリが検査を通っていた
const SELECT_VAR =
  /\.from\(\s*["'`](\w+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,500}?)\.select\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;
const MUTATE = /\.from\(\s*["'`](\w+)["'`]\s*\)\s*\.(insert|update|upsert)\(\s*\{/g;
// 書き込みのペイロードを**変数**で渡す形（.insert(certRow)）。同上
const MUTATE_VAR = /\.from\(\s*["'`](\w+)["'`]\s*\)\s*\.(insert|update|upsert)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g;

/**
 * ブロックコメントの範囲。JSDoc の @example に書かれた見本のクエリを
 * 実コードと取り違えないために要る。
 * 行コメント（//）は範囲に含めない —— select 文字列の中に紛れ込んだ
 * `//` を検出するのがこの検査の目的の一つで、消すと見えなくなる。
 */
function blockCommentRanges(src) {
  const ranges = [];
  const re = /\/\*[\s\S]*?\*\//g;
  for (const m of src.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

/**
 * 直前の行に `schema-check-ignore:` があるクエリは対象外にする。
 * 未作成のテーブルを実行時に握り潰して縮退する作りが実際にあり
 * （在庫の AI 提案は isMissingTableError で空を返す）、それを毎回
 * 落とすと検査が無視される側に回る。**黙って飛ばすのではなく、
 * コードに理由を書かせて明示的に外す**。
 */
function isOptedOut(src, idx) {
  const head = src.lastIndexOf("\n", src.lastIndexOf("\n", idx) - 1);
  return src.slice(Math.max(0, head), idx).includes("schema-check-ignore:");
}

/** 対応する閉じ括弧までを返す */
function balanced(src, openIdx) {
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

/**
 * `.select(`${COLS}, extra`)` のように**モジュール定数**で列を持つ書き方がある。
 * 値を解決できないと「読めない」で落ちてしまうので、リポジトリ全体から
 * `const NAME = "..."` を集めて置き換える。同名で値が違う定数があるときは
 * 置き換えず、そのまま報告する（誤って通すより報告する）
 */
function collectStringConsts(files) {
  const seen = new Map();
  // バッククォートも見る（列リストはテンプレートリテラルで書かれていることが多い）
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:[^\\]|\\.)*?)\2\s*;/g;
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(re)) {
      const [name, , , value] = [m[1], m[2], null, m[3]];
      if (seen.has(name) && seen.get(name) !== value)
        seen.set(name, null); // 曖昧
      else if (!seen.has(name)) seen.set(name, value);
    }
  }
  return seen;
}

/**
 * `const NAME = { ... }` の中身（バランスの取れた括弧まで）を位置つきで集める。
 * **同じ名前が同じファイルに複数ある**（`payload` が2つ、など）ので、
 * 名前だけで引くと別の定義を掴む。使用箇所より前で最も近い定義を選ぶ
 */
function collectObjectConsts(src) {
  const out = new Map();
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?::[^=]*)?\s*=\s*\{/g;
  for (const m of src.matchAll(re)) {
    const open = src.indexOf("{", m.index + m[0].length - 1);
    if (!out.has(m[1])) out.set(m[1], []);
    out.get(m[1]).push({ at: m.index, body: balanced(src, open) });
  }
  return out;
}

/** 使用位置より前にある最も近い定義を返す */
function nearestObject(objects, name, usedAt) {
  const defs = objects.get(name);
  if (!defs) return undefined;
  let best;
  for (const d of defs) if (d.at < usedAt && (!best || d.at > best.at)) best = d;
  return best?.body;
}

const ALL_FILES = TARGETS.flatMap(({ dir }) => walk(join(repoRoot, dir)));
const STRING_CONSTS = collectStringConsts(ALL_FILES);

/**
 * select 文字列の中の `${NAME}` を実際の値に置き換える。
 * **同じファイル内の定義を優先する** —— 別ファイルに同名でも中身の違う
 * ローカル定数がある（baseCols が2つ）ため、全体の表だけでは曖昧になる
 */
function expandConsts(sel, localConsts) {
  return sel.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (whole, name) => {
    const v = localConsts.get(name) ?? STRING_CONSTS.get(name);
    return typeof v === "string" ? v : whole;
  });
}

const summary = [];
for (const { dir, minSelects, minMutations } of TARGETS) {
  const root = join(repoRoot, dir);
  if (!existsSync(root)) throw new Error(`走査対象が無い: ${dir}`);
  let selects = 0;
  let mutations = 0;
  for (const file of walk(root)) {
    const txt = readFileSync(file, "utf8");
    const comments = blockCommentRanges(txt);
    const localConsts = collectStringConsts([file]);
    const localObjects = collectObjectConsts(txt);
    const inComment = (i) => comments.some(([a, b]) => i >= a && i < b);
    const rel = (i) => `${relative(repoRoot, file)}:${txt.slice(0, i).split("\n").length}`;
    for (const m of txt.matchAll(SELECT)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      selects++;
      checkSelect(expandConsts(m[4], localConsts).replace(/\s+/g, " "), m[1], rel(m.index));
    }
    for (const m of txt.matchAll(MUTATE)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      mutations++;
      checkMutation(balanced(txt, txt.indexOf("{", m.index + m[0].length - 1)), m[1], rel(m.index));
    }
    // 列・ペイロードを変数で渡す形。解決できたら中身を見る。できなければ報告する
    for (const m of txt.matchAll(SELECT_VAR)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      selects++;
      const v = localConsts.get(m[3]) ?? STRING_CONSTS.get(m[3]);
      if (typeof v !== "string") {
        addUnresolved(rel(m.index), `select の列を解決できない: ${m[3]}`);
        continue;
      }
      checkSelect(expandConsts(v, localConsts).replace(/\s+/g, " "), m[1], rel(m.index));
    }
    for (const m of txt.matchAll(MUTATE_VAR)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      mutations++;
      const body = nearestObject(localObjects, m[3], m.index);
      if (body === undefined) {
        addUnresolved(rel(m.index), `${m[2]} のペイロードを解決できない: ${m[3]}`);
        continue;
      }
      checkMutation(body, m[1], rel(m.index));
    }
  }
  assert.ok(
    selects >= minSelects,
    `${dir}: select の検出が ${selects} 件しかない（下限 ${minSelects}。正規表現が古い可能性）`,
  );
  assert.ok(
    mutations >= minMutations,
    `${dir}: insert/update の検出が ${mutations} 件しかない（下限 ${minMutations}）`,
  );
  summary.push(`${dir} select ${selects} 件 / 書き込み ${mutations} 件`);
}

assert.deepEqual(
  issues,
  [],
  "実スキーマに合わない箇所があります:\n" +
    issues.join("\n") +
    "\nスキーマを変えた場合は scripts/schema.snapshot.json を更新してください。",
);

assert.ok(
  unresolved.length <= UNRESOLVED_BASELINE,
  `中身を読めないクエリが ${unresolved.length} 件に増えました（上限 ${UNRESOLVED_BASELINE}）。\n` +
    unresolved.join("\n") +
    "\n列は const に括り出すか文字列で書いてください。意図して増やす場合は " +
    "scripts/check-schema.mjs の UNRESOLVED_BASELINE を更新し、理由をコミットに書いてください。",
);

console.log(
  `schema self-check: OK (${summary.join(" / ")} / 中身を読めないクエリ ${unresolved.length} 件（上限 ${UNRESOLVED_BASELINE}）)`,
);
