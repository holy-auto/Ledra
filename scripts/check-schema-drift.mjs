#!/usr/bin/env node
/**
 * 本番スキーマのドリフト検出。
 *
 * 「マイグレーションだけから作った DB」と「本番」を突き合わせ、**本番にあるのに
 * マイグレーションからは作られないオブジェクト**を出す。
 *
 * なぜ要るか（2026-09-06 の棚卸し）:
 *   本番 public に、テーブル23・ビュー1・関数24・トリガ9・enum型5・
 *   イベントトリガ1 の計 63 個が、マイグレーションに定義を持たないまま存在していた。
 *   うち関数5本は 26 本の RLS ポリシーから使われており、**マイグレーションだけから
 *   作った DB は本番と同じ権限判定をしない**状態だった。
 *
 *   既存の検査はどちらもこの形の差を見ない。設計どおりで、欠陥ではない。
 *   - `Migrations Replay` は「全ファイルが流れるか」だけを見て、
 *     できあがったスキーマを本番と比べていない
 *   - `check:schema` の `schema.snapshot.json` は本番から取ったコピーなので、
 *     ドリフトごと写して合格する
 *
 * やり方:
 *   1. `replay-migrations.mjs --dump` で空 DB へ全マイグレーションを流し、
 *      できたスキーマを pg_dump で書き出す
 *   2. 本番の Management API でオブジェクト名を引く
 *   3. 本番にあって再生側に無いものを出す
 *
 *   **マイグレーションの字面を正規表現で読むのではなく、実際に作った DB を見る。**
 *   動的 SQL（`execute format('create ...')`）や DO ブロックの中で作られるものも
 *   そのまま拾えるので、字面を読む方式のような取りこぼしが無い。
 *
 * 必要な env（CI シークレット）:
 *   SUPABASE_ACCESS_TOKEN   Management API のトークン
 *   SUPABASE_PROJECT_ID     プロジェクト ref
 *   CI では `REQUIRE_SCHEMA_DRIFT=1` を立てる。**欠けていたら落とす** —— 黙って skip
 *   すると「検査があるのに何も見ていない」状態が緑で通り続ける（実際 #1045 で入れてから
 *   2026-09-18 まで一度も走っていなかった）。手元とフォークは立てなければ従来どおり skip。
 *
 * 終了コード: ドリフトが1件でもあれば 1。
 *
 * ponytail: 上限その1。`pg_dump --schema=public` は**イベントトリガを含まない**
 *   （スキーマ単位の書き出しに、クラスタ単位のオブジェクトは入らない）。
 *   イベントトリガだけはマイグレーションの字面から拾う。数が少なく、
 *   `create event trigger` に `if not exists` が無いので必ずリテラルで書かれる。
 * ponytail: 上限その2。見るのは**名前の有無**だけで、列の型・既定値・ポリシーの
 *   中身（USING / WITH CHECK の式）までは比べない。**一意制約も名前だけ**で、
 *   同じ名前が両側にあれば対象列が違っても通る。本番の `tenants.plan_tier` は
 *   enum 型なのにマイグレーション側は `text + check` という差が現に残っている
 *   （OPEN_QUESTIONS 参照）。そこまで見るなら pg_dump 同士の差分が要る。
 * ponytail: 上限その4。**一意でない索引は比べない。** 2026-09-21 の実測で、名前の差は
 *   本番にだけ 44 本（うち一意 8）・再生にだけ 36 本（うち一意 2）あり、その大半は旧名と新名が併存しているだけの
 *   性能の話である（どちらが正しいかは実データを見ないと決まらない）。
 *   一方**一意索引は正しさの保証**で、片側に無ければその環境は、もう片側が拒否する
 *   データを受け入れる。だから一意のものだけを両方向で見る。
 *   一意でない索引の差は docs/context/OPEN_QUESTIONS.md に一覧で残してある。
 * ponytail: 上限その3。列は**両方向**を見る。本番にあって再生に無い側（＝本番データを
 *   流し込めなくなる）と、マイグレーションにあって本番に無い側（＝本番でだけ 42703 に
 *   なる。certificates.certificate_no が実例）。テーブル・関数などは本番→再生の一方向
 *   だけで、ポリシーの逆向きは件数を出すに留める（「本番のほうが緩い」は別の判断軸）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { bare, uniqueFromDump, constraintsFromDump } from "./lib/dumpParse.mjs";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com/v1";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_ID;

if (!token || !ref) {
  // ここを「黙って skip して exit 0」にしていたため、この検出器は #1045 で入れてから
  // **一度も実際に走らないまま緑を出し続けていた**（週次ジョブの該当ステップが 0 秒で
  // success。再生だけで数分かかるので、走っていれば 0 秒にはならない）。
  // その間に本番へ ft_* 12 テーブルが入っている。MISTAKE_LEDGER の型 A そのもので、
  // plpgsql 検査には REQUIRE_PLPGSQL_CHECK で同じ穴を塞いでおきながら、こちらは
  // 塞いでいなかった。CI では落とす。手元やフォークでは REQUIRE_SCHEMA_DRIFT を
  // 立てなければ従来どおり skip する。
  const msg =
    "SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID が未設定です。本番と比べられません。";
  if (process.env.REQUIRE_SCHEMA_DRIFT === "1") {
    console.error(`[drift] ${msg}\n  CI ではシークレットの登録が要ります（未登録なら検査は存在しないのと同じです）。`);
    process.exit(1);
  }
  console.log(`[drift] ${msg} skip します（CI では REQUIRE_SCHEMA_DRIFT=1 で落とします）。`);
  process.exit(0);
}

/** 本番で SQL を1本流して行を返す。 */
async function query(sql) {
  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    throw new Error(`Management API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return await res.json();
}

const names = (rows) => rows.map((r) => Object.values(r)[0]).filter(Boolean);

// ── 1. 再生 DB を作って書き出す ─────────────────────────────
const dumpPath = join(tmpdir(), `schema-drift-${process.pid}.sql`);
console.log("[drift] マイグレーションを空 DB へ再生しています（数分かかります）…");
try {
  execFileSync("node", [join(repoRoot, "scripts/replay-migrations.mjs"), "--dump", dumpPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} catch {
  console.error("[drift] 再生に失敗しました。まず `npm run check:migrations` を緑にしてください。");
  process.exit(1);
}
const dump = readFileSync(dumpPath, "utf8");
rmSync(dumpPath, { force: true });

// pg_dump の出力は書き方が一定なので、素直に読める。
const dumped = (re) => new Set([...dump.matchAll(re)].map((m) => m[1].replace(/"/g, "").toLowerCase()));



/**
 * `CREATE TABLE public.x ( ... );` の中身から `表名.列名` を拾う。
 *
 * pg_dump は1列1行で書くが、`GENERATED ALWAYS AS (CASE WHEN ... ELSE ... END)` のように
 * **式が複数行に折り返る**ことがある。行頭の語をそのまま列名として拾うと、その折り返し行の
 * `WHEN` / `ELSE` を列だと誤認する（実際に4件拾ってしまい、再生 DB の pg_attribute と
 * 突き合わせて気づいた）。括弧の深さを追い、深さ0で始まる行だけを列として扱う。
 */
function columnsFromDump(text) {
  const out = new Set();
  const re = /^CREATE (?:UNLOGGED )?TABLE (?:ONLY )?public\.([\w"]+) \(\n([\s\S]*?)^\)/gm;
  for (const m of text.matchAll(re)) {
    const table = bare(m[1]);
    let depth = 0;
    for (const raw of m[2].split("\n")) {
      const startDepth = depth;
      let inStr = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          if (ch === "'") inStr = raw[i + 1] === "'" ? (i++, true) : false;
          continue;
        }
        if (ch === "'") inStr = true;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      if (startDepth !== 0) continue; // 前の行の式の続き
      const line = raw.trim();
      if (!line) continue;
      if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)\b/i.test(line)) continue;
      const col = line.match(/^("?\w+"?)\s/);
      if (col) out.add(`${table}.${bare(col[1])}`);
    }
  }
  return out;
}

/** `CREATE POLICY <名前> ON public.<表>` から `表名.ポリシー名` を拾う。名前は引用符付きもある。 */
function policiesFromDump(text) {
  const out = new Set();
  const re = /^CREATE POLICY ("(?:[^"]|"")+"|\S+) ON public\.([\w"]+)/gm;
  for (const m of text.matchAll(re)) out.add(`${bare(m[2])}.${bare(m[1])}`);
  return out;
}
const replayed = {
  table: dumped(/^CREATE (?:UNLOGGED )?TABLE public\.([\w"]+)/gm),
  view: dumped(/^CREATE (?:MATERIALIZED )?VIEW public\.([\w"]+)/gm),
  // pg_dump は関数もプロシージャも集約も別々のキーワードで書き出す。本番側は
  // `pg_proc` を prokind で絞らずに引くので、ここで拾い漏らすと**永久に消えない
  // 幻のドリフト**になる。3種とも拾う。
  function: dumped(/^CREATE (?:FUNCTION|PROCEDURE|AGGREGATE) public\.([\w"]+)\s*\(/gm),
  trigger: dumped(/^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER ([\w"]+)/gm),
  enum: dumped(/^CREATE TYPE public\.([\w"]+) AS ENUM/gm),
  // 列とポリシーは `表名.名前` で持つ。名前だけだと `id` のように表を跨いで
  // 同名のものが大量にあり、比較が意味を失う。
  column: columnsFromDump(dump),
  policy: policiesFromDump(dump),
  // 一意制約は pg_dump が2つの書き方で出す。**両方拾わないと幻のドリフトになる。**
  //   - 制約として持つもの: `ALTER TABLE ONLY public.t\n    ADD CONSTRAINT c UNIQUE (...)`
  //   - 索引として持つもの: `CREATE UNIQUE INDEX c ON public.t ...`
  // 実際の dump で数えて確かめた（2026-09-21: CREATE UNIQUE INDEX 38 / ADD CONSTRAINT UNIQUE 97 = 135、
  // 同じ再生 DB の pg_index でも 135）。主キーは対象外（本番側のクエリでも除いている）。
  unique_index: uniqueFromDump(dump),
  // 外部キーと CHECK。どちらも「片側に無ければ、その側だけが壊れた行を受け入れる」形の差。
  fk_constraint: constraintsFromDump(dump, "FOREIGN KEY"),
  check_constraint: constraintsFromDump(dump, "CHECK"),
};

// イベントトリガだけは pg_dump に出ないので、マイグレーションの字面から拾う。
const migrationsText = readdirSync(join(repoRoot, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(repoRoot, "supabase/migrations", f), "utf8"))
  .join("\n");
replayed.event_trigger = new Set(
  [...migrationsText.matchAll(/create\s+event\s+trigger\s+([\w"]+)/gi)].map((m) =>
    m[1].replace(/"/g, "").toLowerCase(),
  ),
);

// ── 2. 検出器そのものを検証する ─────────────────────────────
// MISTAKE_LEDGER M-046: 対照を「そうであるはず」で選ぶと、対照のほうが間違う。
// ここでは**本番から引いた実データではなく、再生 DB という手元の事実**に対して
// 当たりを取る。陰性対照は「再生 DB に必ずあるもの」、陽性対照は「架空の名前」。
const NEGATIVE = {
  table: ["tenants", "certificates", "insurer_tenant_access"],
  view: ["certificates_public"],
  function: ["insurer_accessible_tenant_ids", "set_updated_at"],
  trigger: ["trg_certificates_updated_at"],
  enum: ["plan_tier_enum"],
  event_trigger: ["ensure_rls"],
  // 列は `GENERATED ... CASE WHEN` の折り返しを誤認しやすいので、その形を持つ表
  // （vehicle_size_master）からも1件取る。
  column: ["certificates.public_id", "tenants.plan_tier", "vehicle_size_master.id"],
  policy: ["certificates.certificates_select_v2", "tenants.tenants_select_v2"],
  // 2つの書き方それぞれから1件ずつ取る（片方の正規表現が壊れても対照が落ちるように）。
  //   tenants_slug_key            … ADD CONSTRAINT ... UNIQUE 由来
  //   idx_documents_public_id     … CREATE UNIQUE INDEX 由来
  unique_index: ["tenants.tenants_slug_key", "documents.idx_documents_public_id"],
  fk_constraint: ["certificates.certificates_tenant_id_fkey", "vehicles.vehicles_tenant_id_fkey"],
  // CREATE TABLE 内の `CONSTRAINT <名前> CHECK` 由来も1件入れる（2つの書き方を両方見る）。
  check_constraint: ["documents.documents_status_check", "job_orders.job_orders_status_check"],
};
/** 本番側の名前のうち、再生 DB に無いものを返す。**本番の比較もここを通る。** */
const missingFrom = (kind, prodNames) =>
  prodNames.filter((n) => !replayed[kind].has(String(n).toLowerCase()));

const FAKE = "zzz_definitely_not_created_zzz";
let negativeCount = 0;
let positiveCount = 0;
for (const [kind, controls] of Object.entries(NEGATIVE)) {
  // 陰性対照: 再生 DB に必ずあるものが「無い」と出てはいけない。
  for (const c of controls) {
    if (missingFrom(kind, [c]).length !== 0) {
      console.error(
        `[drift] 陰性対照が落ちました: ${kind} の ${c} が再生 DB から拾えていません。` +
          " 検出器か対照のどちらかが間違っています（両方を疑ってください）。",
      );
      process.exit(1);
    }
    negativeCount += 1;
  }
  // 陽性対照: **比較そのもの**に架空の名前を通す。集合へ `has` を問うだけだと
  // 「集合に無いものは無い」を確かめるだけで必ず通り、比較が壊れていても
  // OK と出てしまう（PR #1045 のレビュー指摘）。本番と同じ経路を通す。
  if (missingFrom(kind, [FAKE]).length !== 1) {
    console.error(`[drift] 陽性対照が落ちました: ${kind} で架空の名前を検出できませんでした。`);
    process.exit(1);
  }
  positiveCount += 1;
}
console.log(
  `[drift] 検出器の自己検証: 陰性対照 ${negativeCount} 件 / 陽性対照 ${positiveCount} 件 いずれも OK`,
);

// ── 3. 本番を引く ───────────────────────────────────────────
const prod = {
  table: names(
    await query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by 1",
    ),
  ),
  // `information_schema.views` はマテリアライズドビューを含まないので pg_class を引く
  // （'v' 通常ビュー / 'm' マテビュー。今は 0 件だが、増えたときに黙って見逃さない）。
  view: names(
    await query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by 1",
    ),
  ),
  // 拡張機能が持ち込んだ関数は「マイグレーションで作るもの」ではないので除く。
  function: names(
    await query(
      "select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace" +
        " where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1",
    ),
  ),
  trigger: names(
    await query(
      "select distinct t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid" +
        " join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1",
    ),
  ),
  enum: names(
    await query(
      "select distinct t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e' order by 1",
    ),
  ),
  // Supabase が自分で作るイベントトリガ（pgrst_* / issue_*）は対象外。
  event_trigger: names(
    await query(
      "select evtname from pg_event_trigger where evtname not like 'pgrst\\_%' and evtname not like 'issue\\_%' order by 1",
    ),
  ),
  column: names(
    await query(
      "select c.relname||'.'||a.attname from pg_attribute a" +
        " join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace" +
        " where n.nspname='public' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped order by 1",
    ),
  ),
  policy: names(
    await query(
      "select c.relname||'.'||p.polname from pg_policy p" +
        " join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace" +
        " where n.nspname='public' order by 1",
    ),
  ),
  // 一意制約。主キーは別軸（表があれば必ず付いてくる）なので除く。
  // 制約由来か索引由来かは問わない —— 名前で突き合わせる。
  //
  // **`indisvalid` を必ず見る。** `CREATE UNIQUE INDEX CONCURRENTLY` は待機フェーズで
  // 落ちると `indisvalid = false` の索引を残す。名前は pg_index に在るので、
  // 見ないと「在る」と読んでしまい、次の実行は `IF NOT EXISTS` で黙って飛ぶ。
  // **無効な索引は一意性を強制しない**ので、この検出器が塞ごうとしている穴
  // （本番だけが重複を受け入れる）がそのまま残る。無効なら「無い」として扱い、落とす。
  unique_index: names(
    await query(
      "select t.relname||'.'||i.relname from pg_index ix" +
        " join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid" +
        " join pg_namespace n on n.oid=t.relnamespace" +
        " where n.nspname='public' and ix.indisunique and not ix.indisprimary" +
        " and ix.indisvalid and ix.indisready order by 1",
    ),
  ),
  fk_constraint: names(
    await query(
      "select t.relname||'.'||c.conname from pg_constraint c" +
        " join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace" +
        " where n.nspname='public' and c.contype='f' order by 1",
    ),
  ),
  check_constraint: names(
    await query(
      "select t.relname||'.'||c.conname from pg_constraint c" +
        " join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace" +
        " where n.nspname='public' and c.contype='c' order by 1",
    ),
  ),
};

// ── 4. 突き合わせ ───────────────────────────────────────────
const LABEL = {
  table: "テーブル",
  view: "ビュー",
  function: "関数",
  trigger: "トリガ",
  enum: "enum 型",
  event_trigger: "イベントトリガ",
  column: "列",
  policy: "RLS ポリシー",
  unique_index: "一意制約",
  fk_constraint: "外部キー",
  check_constraint: "CHECK 制約",
};

// 表ごと無いときは、その表の列とポリシーも当然すべて無い。根本原因は表のほうなので、
// 列・ポリシーの側では黙らせる（ft_* 12 表で 150 行以上の重複になり、本当に見るべき
// 「既存の表に後から足された列」が埋もれる）。件数だけは残す。
const missingTables = new Set(missingFrom("table", prod.table).map((t) => String(t).toLowerCase()));
const tableOf = (key) => String(key).slice(0, String(key).indexOf(".")).toLowerCase();

let total = 0;
console.log("");
for (const kind of Object.keys(LABEL)) {
  const all = missingFrom(kind, prod[kind]);
  const nested =
    kind === "column" || kind === "policy" || kind === "unique_index" ||
    kind === "fk_constraint" || kind === "check_constraint";
  const missing = nested ? all.filter((n) => !missingTables.has(tableOf(n))) : all;
  const hidden = all.length - missing.length;
  total += missing.length;
  console.log(
    `[drift] ${LABEL[kind]}: 本番 ${prod[kind].length} 件 / マイグレーションから作られない ${missing.length} 件` +
      (hidden > 0 ? `（ほかに、表ごと無い ${hidden} 件は表の側に集約）` : ""),
  );
  for (const n of missing) console.log(`         - ${n}`);
}

// 逆向き（マイグレーションが作るのに本番に無い列）も落とす。
//
// こちらを見ないと、**この検出器を足す原因になった不具合そのものを見逃す**。
// certificates.certificate_no はマイグレーション側にだけ在り、本番の2関数がそれを読んで
// 42703 で落ちていた（DECISION_LOG 2026-09-18）。「本番にあって再生に無い」だけを見る
// 検出器は、この向きを構造的に検出できない。
//
// 列に限る: 本番に無い列を読むコードは本番で落ちるので、実害が直接つながる。
// ポリシーの逆向き（マイグレーションにだけ在る）は「本番のほうが緩い」という別の話で、
// 落とす基準が違うため件数だけ出す。
const lowerSet = (xs) => new Set(xs.map((n) => String(n).toLowerCase()));
const notInProd = (kind) => {
  const inProd = lowerSet(prod[kind]);
  return [...replayed[kind]].filter((k) => !inProd.has(k)).sort();
};
const extraColumns = notInProd("column");
const extraPolicies = notInProd("policy");
// 一意制約の逆向きも落とす。**これを見ないと、本番だけ一意性が消えた状態に気づけない。**
// 実例: `idx_payments_idempotency`（決済の冪等キー）は 2026-09-18 に remote_schema が
// 本番だけで落としており、マイグレーション側には在った。列を両方向で見ていた
// 2026-09-20 時点でも、この検査は素通りしていた（DECISION_LOG 2026-09-21）。
const extraUnique = notInProd("unique_index");
// 外部キーの逆向きも落とす。片側に無ければ、その側だけが**参照先の消えた行**を受け入れる。
// 実例: `tenant_memberships_user_id_fkey` は 2026-09-18 に remote_schema が本番だけで落とし、
// その後、利用者が消えても残る membership 行が本番に1件生まれた（DECISION_LOG 2026-09-21）。
const extraFk = notInProd("fk_constraint");
// CHECK の逆向きは**件数だけ出して落とさない**。本番が列そのものを enum にして
// CHECK を置き換えている例があり（certificates.status / tenants.plan_tier /
// tenant_memberships.role）、それは「本番が緩い」ではなく「別の形で同じことをしている」。
// ここを落とすと、直しようのない赤が居座って新しいドリフトが埋もれる。
// 型の差を見る検出器は無い —— OPEN_QUESTIONS の宿題。
const extraCheck = notInProd("check_constraint");

console.log(
  `[drift] 逆向き: マイグレーションが作るのに本番に無い 列 ${extraColumns.length} 件 /` +
    ` 一意制約 ${extraUnique.length} 件 / 外部キー ${extraFk.length} 件 /` +
    ` CHECK ${extraCheck.length} 件（落とさない）/ ポリシー ${extraPolicies.length} 件`,
);
for (const n of extraFk) console.log(`         - ${n}（外部キー）`);
for (const n of extraCheck) console.log(`         - ${n}（CHECK・落とさない）`);
for (const n of extraColumns) console.log(`         - ${n}`);
// 表ごと本番に無い場合は「本番だけが重複を受け入れる」ではなく「表そのものが無い」。
// 同じ行で同じ文言を出すと、読んだ人が原因を取り違える。分けて出す（どちらも落とす）。
const prodTableSet = lowerSet(prod.table);
const extraUniqueTableMissing = extraUnique.filter((n) => !prodTableSet.has(tableOf(n)));
const extraUniqueTablePresent = extraUnique.filter((n) => prodTableSet.has(tableOf(n)));
for (const n of extraUniqueTablePresent) console.log(`         - ${n}（一意制約）`);
for (const n of extraUniqueTableMissing) {
  console.log(`         - ${n}（一意制約。ただし**表そのものが本番に無い** —— 先に表を見ること）`);
}

if (total > 0 || extraColumns.length > 0 || extraUnique.length > 0 || extraFk.length > 0) {
  if (total > 0) {
    console.error(
      `\n[drift] 本番にだけ存在するオブジェクトが ${total} 件あります。` +
        "\n  マイグレーションを通さず本番へ入ったか、作成元のファイルが再生できていません。" +
        "\n  対処は docs/context/OPEN_QUESTIONS.md「マイグレーション外で本番スキーマへ入った」の項を参照。",
    );
  }
  if (extraColumns.length > 0) {
    console.error(
      `\n[drift] マイグレーションにだけ存在する列が ${extraColumns.length} 件あります。` +
        "\n  本番に無い列を読むコードは、本番でだけ 42703 で落ちます（実例: certificates.certificate_no）。" +
        "\n  足すか、読んでいる側から外すかを決めてください。",
    );
  }
  if (extraUniqueTablePresent.length > 0) {
    console.error(
      `\n[drift] マイグレーションにだけ存在する一意制約が ${extraUniqueTablePresent.length} 件あります。` +
        "\n  **本番だけがその重複を受け入れます。**性能ではなく正しさの差です" +
        "（実例: idx_payments_idempotency —— 決済の冪等キーが本番でだけ効いていなかった）。" +
        "\n  `CREATE UNIQUE INDEX CONCURRENTLY` が落ちて無効な索引が残っている場合も" +
        "ここに出ます（indisvalid を見ているため）。その場合は DROP してから作り直してください。" +
        "\n  本番へ戻すか、マイグレーション側から外すかを決めてください。",
    );
  }
  if (extraFk.length > 0) {
    console.error(
      `\n[drift] マイグレーションにだけ存在する外部キーが ${extraFk.length} 件あります。` +
        "\n  **本番だけが参照先の消えた行を受け入れます。**" +
        "\n  戻すときは NOT VALID で足してください（既存の壊れた行があると VALID では足せません）。",
    );
  }
  if (extraUniqueTableMissing.length > 0) {
    console.error(
      `\n[drift] マイグレーションにだけ存在する一意制約のうち ${extraUniqueTableMissing.length} 件は、` +
        "**表そのものが本番にありません**。一意制約ではなく表の未適用として追ってください。",
    );
  }
  process.exit(1);
}

console.log("\n[drift] ドリフト無し。本番とマイグレーションの列・オブジェクトは双方向で一致しています。");
process.exit(0);
