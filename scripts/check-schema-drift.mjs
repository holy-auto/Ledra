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
 *   どちらか欠けたら skip して exit 0（フォークで落ちないように）。
 *
 * 終了コード: ドリフトが1件でもあれば 1。
 *
 * ponytail: 上限その1。`pg_dump --schema=public` は**イベントトリガを含まない**
 *   （スキーマ単位の書き出しに、クラスタ単位のオブジェクトは入らない）。
 *   イベントトリガだけはマイグレーションの字面から拾う。数が少なく、
 *   `create event trigger` に `if not exists` が無いので必ずリテラルで書かれる。
 * ponytail: 上限その2。見るのは**オブジェクトの有無**だけで、列の型・既定値・
 *   ポリシーの中身までは比べない。本番の `tenants.plan_tier` は enum 型なのに
 *   マイグレーション側は `text + check` という差が現に残っている
 *   （OPEN_QUESTIONS 参照）。そこまで見るなら pg_dump 同士の差分が要る。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com/v1";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_ID;

if (!token || !ref) {
  console.log("[drift] SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID が未設定のため skip します。");
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
const replayed = {
  table: dumped(/^CREATE (?:UNLOGGED )?TABLE public\.([\w"]+)/gm),
  view: dumped(/^CREATE (?:MATERIALIZED )?VIEW public\.([\w"]+)/gm),
  // pg_dump は関数もプロシージャも集約も別々のキーワードで書き出す。本番側は
  // `pg_proc` を prokind で絞らずに引くので、ここで拾い漏らすと**永久に消えない
  // 幻のドリフト**になる。3種とも拾う。
  function: dumped(/^CREATE (?:FUNCTION|PROCEDURE|AGGREGATE) public\.([\w"]+)\s*\(/gm),
  trigger: dumped(/^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER ([\w"]+)/gm),
  enum: dumped(/^CREATE TYPE public\.([\w"]+) AS ENUM/gm),
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
};

// ── 4. 突き合わせ ───────────────────────────────────────────
const LABEL = {
  table: "テーブル",
  view: "ビュー",
  function: "関数",
  trigger: "トリガ",
  enum: "enum 型",
  event_trigger: "イベントトリガ",
};

let total = 0;
console.log("");
for (const kind of Object.keys(LABEL)) {
  const missing = missingFrom(kind, prod[kind]);
  total += missing.length;
  console.log(`[drift] ${LABEL[kind]}: 本番 ${prod[kind].length} 件 / マイグレーションから作られない ${missing.length} 件`);
  for (const n of missing) console.log(`         - ${n}`);
}

if (total > 0) {
  console.error(
    `\n[drift] 本番にだけ存在するオブジェクトが ${total} 件あります。` +
      "\n  マイグレーションを通さず本番へ入ったか、作成元のファイルが再生できていません。" +
      "\n  対処は docs/context/OPEN_QUESTIONS.md「マイグレーション外で本番スキーマへ入った」の項を参照。",
  );
  process.exit(1);
}

console.log("\n[drift] ドリフト無し。本番のオブジェクトはすべてマイグレーションから再現できます。");
process.exit(0);
