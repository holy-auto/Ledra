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
import { dirname, resolve, join, relative, isAbsolute } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const schema = JSON.parse(readFileSync(join(repoRoot, "scripts/schema.snapshot.json"), "utf8"));
const cols = new Map(Object.entries(schema).map(([t, c]) => [t, new Set(c)]));

// 走査対象と、そこにあるはずのクエリ数の下限。0 件は必ず異常で、
// 大きく減ったら正規表現が実装の書き方に追いつけていない
const TARGETS = process.env.CHECK_SCHEMA_DIRS
  ? // テスト用: 走査対象を差し替える（scripts/__tests__/check-schema-parse.test.ts）。
    // 下限は 0 にして、1ファイルだけでも走るようにする
    process.env.CHECK_SCHEMA_DIRS.split(",").map((dir) => ({ dir, minSelects: 0, minMutations: 0 }))
  : [
      { dir: "src", minSelects: 2000, minMutations: 800 },
      { dir: "apps/mobile/src", minSelects: 55, minMutations: 5 },
      // 運用スクリプトも実 DB を触る。役目を終えた平文シークレットのバックフィルが
      // 削除済み列を参照したまま残っていたので、ここも対象に入れる
      { dir: "scripts", minSelects: 0, minMutations: 0 },
    ];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    // テストは対象外。わざと壊したクエリを書く場所なので、実コードと混ぜると
    // 検査自身のテストが検査に落とされる
    if (e === "__tests__" || e === "__mocks__") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
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
 *
 * 54 → 32 に減らした内訳（2026-08-24）: `const rows = xs.map((x) => ({ ... }))`
 * を読めるようにした。この形が最多で、読めるようにした結果
 * `notifications.type`（実列は notification_type）という**100% 失敗していた
 * 書き込み**が1件見つかった。
 *
 * 残っている 32 件の形:
 *   - `const updates = parsed.data`（zod スキーマの検証結果をそのまま渡す）
 *     → 列は zod スキーマ側にある。別ファイルの `z.object({...})` を読む必要があり、
 *       `.omit()` / `.extend()` を追うと誤検知の危険が高いので手を付けていない
 *   - 動的に組み立てる select 文字列
 *   - `.map()` の中で分岐して形が変わるもの
 * ponytail: 上限。生成型 (db:typegen) でクエリを型付けすれば、この枠は要らなくなる。
 */
const unresolved = [];
const UNRESOLVED_BASELINE = 32;
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
    // キャストを先に落とす。順序を逆にすると `col::text` の `text` を列名として
    // 見てしまい、本物の誤りが名前で出てこない
    const col = raw.split("::")[0].split(":").pop().trim();
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
 * `.eq()` などフィルタの列名も見る。
 *
 * なぜ要るか: PostgREST は**フィルタの列が存在しなくても**クエリごと 400 を返す。
 * `select` の列だけ見ていると、`.or("warranty_period.not.is.null")` のような
 * 書き方が素通りする（実際に素通りしていた）。
 *
 * 誤検知を出さないため、**素直な識別子だけ**を照合する。次は見ない:
 *   - `customers.name` のような埋め込み先の列（対象テーブルを決められない）
 *   - `meta->>foo` のような JSON パス
 *   - テンプレートリテラルで組んだ列名
 * ponytail: 上限。埋め込み先のフィルタは対象外なので、そこは素通りする。
 */
const FILTER_CALL =
  /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|overlaps|filter|not|order)\(\s*(["'`])([^"'`]*)\2/g;
const OR_CALL = /\.or\(\s*(["'`])([^"'`]*)\1/g;
/** PostgREST の `.or()` に書ける演算子。これで始まらないものは列名の後ろではない */
const OR_OPS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "cs", "cd",
  "sl", "sr", "nxl", "nxr", "adj", "ov", "fts", "plfts", "phfts", "wfts", "not",
]);

const PLAIN_COLUMN = /^[a-z_][a-z0-9_]*$/;

function checkFilterColumn(col, table, where, how) {
  if (!PLAIN_COLUMN.test(col)) return; // 埋め込み・JSON パス・テンプレートは対象外
  const have = cols.get(table);
  if (!have) return;
  if (!have.has(col)) add(where, `${table}.${col} が存在しない（${how} のフィルタ）`);
}

/**
 * `.from(...)` の直後から続く **`.メソッド(...)` の並びだけ**を切り出す。
 *
 * 文末（`;`）や次の `.from(` で切ると足りない。`Promise.all([...])` の中では
 * `.from("nfc_tags")...is("uid", null),` の次に**別の変数のチェーン**が
 * セミコロン無しで続くため、後ろのフィルタを吸い込んで誤検知する
 * （実際に nfc_tags に対して 2 件の誤検知が出た）。
 * メソッド呼び出しでなくなった時点で必ず止める。
 */
function methodChain(src, from) {
  let i = from;
  const start = i;
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== ".") break;
    let j = i + 1;
    while (j < src.length && /[\w$]/.test(src[j])) j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== "(") break; // `.data` のようなプロパティ参照で終わり
    const end = balancedRange(src, j, "(", ")");
    if (end === null) break;
    i = j + 1 + end.length + 1; // "(" + 中身 + ")"
  }
  return src.slice(start, i);
}

/**
 * `let q = supabase.from("x")…` の `q` を取る。
 * `const` は再代入できないので `let` / `var` だけを見る。
 */
const LET_BINDING = /(?:^|[;{}\n])\s*(?:let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:await\s+)?[A-Za-z_$][\w$.]*\s*$/;
function bindingBefore(src, fromIdx) {
  const m = LET_BINDING.exec(src.slice(Math.max(0, fromIdx - 300), fromIdx));
  return m ? m[1] : null;
}

/**
 * 条件付きのフィルタを**代入で足していく**形（`if (q) query = query.or(...)`）。
 *
 * なぜ要るか: `methodChain` は `.from()` に続くメソッドの並びしか見ない。
 * 代入で足したフィルタはそこに現れないので、まるごと素通りしていた。
 * 実際に `/api/admin/certificates` の検索が `certificates.plate_display` という
 * **存在しない列**でフィルタしていて、検索するたびに 400 になっていた
 * （画面には「まだ証明書は発行されていません」と出る）。
 *
 * 変数名は使い回されるので、`q = q.…` 以外の代入が来たら打ち切る。
 * ponytail: 上限。`applyFilters(q)` のように関数へ渡す形は追えない。
 */
function reassignChains(src, varName, from, until) {
  const out = [];
  // `$` は識別子にも正規表現のアンカーにも使える。`\b` では `$q` を拾えないので
  // 「直前が識別子の一部でない」で見る（`foo.q = …` のような代入も除ける）
  const v = varName.replace(/\$/g, "\\$");
  const re = new RegExp(`(?<![\\w$.])${v}\\s*=\\s*(?!=)`, "g");
  const cont = new RegExp(`^${v}\\s*(?=\\.)`);
  re.lastIndex = from;
  for (let m; (m = re.exec(src)) && m.index < until; ) {
    const rhs = m.index + m[0].length;
    // 別のクエリを入れ直したら、そこから先は別のテーブル
    if (/^\s*(?:await\s+)?[A-Za-z_$][\w$.]*\s*\.\s*from\s*\(/.test(src.slice(rhs, rhs + 200))) break;
    // `query = scopeToStore(query, …)` のような**包み直し**。ここで打ち切ると
    // その後ろのフィルタが全部見えなくなるので、飛ばして次の代入を見る
    const c = cont.exec(src.slice(rhs, rhs + varName.length + 64));
    if (!c) continue;
    out.push({ index: m.index, chain: methodChain(src, rhs + c[0].length) });
  }
  return out;
}

/**
 * `from` を含むブロックの終わり（対応する `}`）。
 *
 * なぜ要るか: 変数名は使い回される。`let query = …from("agents")` の後ろを
 * ファイル末尾まで見ると、**別の関数の** `query = query.eq(...)` を
 * agents の列として報告する（実際に誤検知した）。
 * ponytail: 上限。コメントの中の `}` でも止まる（見落とすだけで誤検知はしない）。
 */
function enclosingBlockEnd(src, from) {
  let d = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") d++;
    else if (c === "}") {
      if (d === 0) return i;
      d--;
    }
  }
  return src.length;
}

/** 1つのチェーン（`.from(...)` から文末まで）のフィルタを全部見る */
function checkFilters(chain, table, where) {
  if (!cols.has(table)) return;
  // 入れ子のチェーン（`.in("order_id", (await admin.from("x").eq("tenant_id", ...)))`）は
  // 別テーブルのフィルタ。手前で切らないと親テーブルの列として誤検知する
  const nested = chain.indexOf(".from(");
  if (nested >= 0) chain = chain.slice(0, nested);
  for (const m of chain.matchAll(FILTER_CALL)) {
    // `.order("col", { referencedTable: "x" })` は別テーブルの列。対象外
    if (m[1] === "order" && /referencedTable|foreignTable/.test(chain.slice(m.index, m.index + 160))) continue;
    checkFilterColumn(m[3], table, where, `.${m[1]}()`);
  }
  for (const m of chain.matchAll(OR_CALL)) {
    // `a.eq.1,b.is.null` の形。入れ子（`and(...)`）が入るものは見ない
    if (m[2].includes("(")) continue;
    for (const part of m[2].split(",")) {
      const [col, op] = part.trim().split(".");
      if (!col || !op || !OR_OPS.has(op)) continue;
      checkFilterColumn(col, table, where, ".or()");
    }
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
  // 別名は素直な識別子でなければならない。`:` の後ろだけ見て通していたせいで、
  // select 文字列の中に書いた `//` コメントが**別名の一部として飲み込まれ**、
  // 素通りしていた（モバイルの作業タブが 400 のまま残っていた）
  if (alias && !/^[A-Za-z_$][\w$]*$/.test(alias)) {
    add(where, `埋め込みの別名として読めない: ${JSON.stringify(alias)}`);
    return;
  }
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
  // トップレベルのキーだけ拾う（ネストした値の中のキーは列ではない）。
  // **文字列の中の括弧は数えない** —— `{ notes: "a } b", ... }` で深さが狂い、
  // 以降のキーを1つも見なくなる
  let depth = 0;
  let atKey = true;
  let buf = "";
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{" || c === "[" || c === "(") depth++;
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
// `.from("x") ... .select(` の位置だけを見つける。中身は括弧の対応で取り出す
// （`"a, b" + "c, d"` のような**連結**を1つ目のリテラルだけで判断すると、
//  2つ目に混ざった存在しない列を見逃す。実際に見逃していた）
const FROM_HEAD = /\.from\(\s*["'`](\w+)["'`]\s*\)/g;
const SELECT_HEAD = /\.from\(\s*["'`](\w+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,500}?)\.select\(/g;
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

/**
 * `open` の位置から対応する閉じ括弧までの中身を返す。**文字列リテラルの中の
 * 括弧は数えない**。対応が見つからなければ `null`（＝読めなかった）。
 *
 * 読めなかったことを空文字と区別するのが要。空文字を返すと、引数なしの
 * `.select()` と「解析に失敗した」が同じ扱いになり、**壊れたクエリが素通りする**。
 */
function balancedRange(src, openIdx, open, close) {
  let d = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === open) d++;
    else if (c === close) {
      d--;
      if (d === 0) return src.slice(openIdx + 1, i);
    }
  }
  return null;
}

/**
 * `.select(...)` の第1引数を列の文字列として読む。
 * `"a" + "b"` の連結、テンプレート、定数、`cond ? A : B`（**両方の枝**を返す）に対応する。
 * 読めない部分が残ったら null を返す（黙って通さない）。
 */
function readSelectArg(arg, localConsts) {
  if (arg === null) return null; // 括弧の対応が取れなかった＝読めていない
  // 第2引数（{ count: "exact" }）より前だけを見る
  const first = splitTopLevel(arg, ",")[0] ?? "";
  const expr = stripComments(first).trim();
  // 引数なしの `.select()` は全列。照合するものが無い
  if (!expr) return ["*"];

  // 三項演算子は枝ごとに読む（片方しか見ないと、もう片方の誤りを見逃す）
  const q = indexOfTopLevel(expr, "?");
  if (q >= 0) {
    const c = indexOfTopLevel(expr, ":", q + 1);
    if (c > q) {
      const a = readSelectArg(expr.slice(q + 1, c), localConsts);
      const b = readSelectArg(expr.slice(c + 1), localConsts);
      if (a === null || b === null) return null;
      return [...a, ...b];
    }
  }

  const out = [];
  for (const part of splitTopLevel(expr, "+").map((t) => t.trim())) {
    const lit = /^(["\'`])([\s\S]*)\1$/.exec(part);
    if (lit) {
      out.push(lit[2]);
      continue;
    }
    if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      const v = localConsts.get(part) ?? STRING_CONSTS.get(part);
      if (typeof v !== "string") return null;
      out.push(v);
      continue;
    }
    return null;
  }
  return [out.join("")];
}

/** 行・ブロックコメントを取り除く（文字列の中は触らない） */
function stripComments(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") out += src[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      out += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      out += " ";
      continue;
    }
    out += c;
  }
  return out;
}

/** 深さ0（クォート・括弧の外）だけで区切る */
function splitTopLevel(src, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let buf = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      buf += c;
      if (c === "\\") buf += src[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/** 深さ0にある文字の位置。無ければ -1 */
function indexOfTopLevel(src, ch, from = 0) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ch && depth === 0 && i >= from) return i;
  }
  return -1;
}

/** `{ ... }` の中身。文字列の中の波括弧は数えない（`{ note: 'a } b' }` で切れないため） */
function balanced(src, openIdx) {
  return balancedRange(src, openIdx, "{", "}");
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
  const push = (name, at, body) => {
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({ at, body });
  };

  // `const row = { ... }`
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?::[^=]*)?\s*=\s*\{/g;
  for (const m of src.matchAll(re)) {
    const open = src.indexOf("{", m.index + m[0].length - 1);
    push(m[1], m.index, balanced(src, open));
  }

  /**
   * `const rows = items.map((x) => ({ ... }))` の形。
   *
   * 書き込みのペイロードを配列で組む書き方はこれが圧倒的に多く、
   * 「中身を読めないクエリ」54 件のうち大半がこれだった。map の中の
   * オブジェクトリテラルは行ごとに同じ形なので、1つ読めば列は分かる。
   * ponytail: 上限。`.map()` の中で分岐して別の形を返す場合は最初の形しか見ない。
   */
  const mapRe =
    // `=` と `.map(` の間に `;` や波括弧を挟ませない。挟ませると
    // `let itemCount = 0;` の次の行の `const rows = xs.map(...)` を
    // itemCount の定義として拾ってしまう（実際に拾っていた）
    /(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)(?::[^=;{}]*)?\s*=\s*[^;{}]{0,200}?\.map\(\s*(?:async\s*)?\(?[^)=]{0,120}?\)?\s*=>\s*\(\s*\{/g;
  for (const m of src.matchAll(mapRe)) {
    const open = src.lastIndexOf("{", m.index + m[0].length);
    push(m[1], m.index, balanced(src, open));
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

const ALL_FILES = TARGETS.flatMap(({ dir }) => walk(isAbsolute(dir) ? dir : join(repoRoot, dir)));
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
  const root = isAbsolute(dir) ? dir : join(repoRoot, dir);
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
    // フィルタの列名。`.from(...)` に続く `.メソッド(...)` の並びだけを1本と見る
    for (const m of txt.matchAll(FROM_HEAD)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      const after = m.index + m[0].length;
      const chain = methodChain(txt, after);
      checkFilters(chain, m[1], rel(m.index));
      // 後から `query = query.eq(...)` と足すフィルタも同じテーブルのもの
      const v = bindingBefore(txt, m.index);
      if (v) {
        for (const r of reassignChains(txt, v, after + chain.length, enclosingBlockEnd(txt, m.index))) {
          if (inComment(r.index) || isOptedOut(txt, r.index)) continue;
          checkFilters(r.chain, m[1], rel(r.index));
        }
      }
    }
    for (const m of txt.matchAll(SELECT_HEAD)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      selects++;
      const open = m.index + m[0].length - 1;
      const raws = readSelectArg(balancedRange(txt, open, "(", ")"), localConsts);
      if (raws === null) {
        addUnresolved(rel(m.index), "select の列を解決できない（定数にするか文字列で書く）");
        continue;
      }
      // 三項演算子は枝ごとに返るので、全部を照合する
      for (const raw of raws) {
        checkSelect(expandConsts(raw, localConsts).replace(/\s+/g, " "), m[1], rel(m.index));
      }
    }
    for (const m of txt.matchAll(MUTATE)) {
      if (inComment(m.index) || isOptedOut(txt, m.index)) continue;
      mutations++;
      const body = balanced(txt, txt.indexOf("{", m.index + m[0].length - 1));
      if (body === null) {
        addUnresolved(rel(m.index), `${m[2]} のペイロードを解決できない（括弧の対応が取れない）`);
        continue;
      }
      checkMutation(body, m[1], rel(m.index));
    }
    // 書き込みのペイロードを変数で渡す形。解決できたら中身を見る。できなければ報告する
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
  process.env.CHECK_SCHEMA_DIRS ? true : unresolved.length <= UNRESOLVED_BASELINE,
  `中身を読めないクエリが ${unresolved.length} 件に増えました（上限 ${UNRESOLVED_BASELINE}）。\n` +
    unresolved.join("\n") +
    "\n列は const に括り出すか文字列で書いてください。意図して増やす場合は " +
    "scripts/check-schema.mjs の UNRESOLVED_BASELINE を更新し、理由をコミットに書いてください。",
);

console.log(
  `schema self-check: OK (${summary.join(" / ")} / 中身を読めないクエリ ${unresolved.length} 件（上限 ${UNRESOLVED_BASELINE}）)`,
);
