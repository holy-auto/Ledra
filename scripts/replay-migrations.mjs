#!/usr/bin/env node
/**
 * マイグレーションを空の PostgreSQL に流し直して、**再生できるか**を確かめる。
 *
 * なぜ要るか: 本番はマイグレーションを順に当てて出来上がっているはずだが、実際には
 * 「本番にあるのにマイグレーションのどこにも書かれていない列」が 26 個あった。
 * 空 DB から再生できない限り、この種のずれは静かに増え続ける（気づく手段が無い）。
 *
 * 使い方:
 *   node scripts/replay-migrations.mjs                 # 一時 DB を自分で立てて再生
 *   node scripts/replay-migrations.mjs --keep          # 終了後も DB を残す（調査用）
 *   node scripts/replay-migrations.mjs --dsn <dsn>     # 既にある DB へ流す
 *   node scripts/replay-migrations.mjs --dump <path>   # 成功したらスキーマをダンプ
 *
 * 何をするか:
 *   1. bootstrap.sql で Supabase が既定で持っているもの（auth/storage/ロール/拡張）を作る
 *   2. supabase/migrations/*.sql をファイル名順に流す
 *   3. 失敗したファイルは覚えておき、**進捗がある限り繰り返す**（順序の前後は多重パスで吸収）
 *   4. 何周しても通らないファイルを理由付きで報告する
 *
 * ponytail: 多重パスは順序の誤りを「回避」するだけで直してはいない。上限は
 * 「同じファイルの中で前後関係が壊れている場合は何周しても通らない」こと。
 * 恒久対応は baseline 方式（docs/operations/migrations.md）。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const BOOTSTRAP = join(ROOT, "scripts", "replay", "bootstrap.sql");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const PG_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";

/**
 * 何周しても通らないことが分かっているファイル。**履歴を書き換えない限り直せない**もの。
 * 件数ではなくファイル名で持つ（件数だと「1本直って1本壊れた」を見逃す）。
 *
 * ここに載っている理由:
 *   - tenant_members: **一度も存在しなかったテーブル**を RLS ポリシーが参照している。
 *     正しくは tenant_memberships。本番でもこの2ファイルは失敗している
 *   - is_active: tenant_memberships に**本番にも無い列**を参照している
 *   - cannot change return type: 同じ関数を戻り値の型違いで2回定義しており、
 *     ファイル名の順序と依存関係が逆転している（1周目は前提テーブルがまだ無い）
 *   - cannot drop columns from view: 統合前の invoices を前提にしたビュー定義
 *
 * **新しく増えたら CI を落とす。** 減らす分には歓迎（この配列から消す）。
 */
const KNOWN_UNREPLAYABLE = [
  "20260313000001_dashboard_enhancements.sql",
  "20260325900000_insurer_tenant_contracts.sql",
  "20260325900001_insurer_search_plan_limits.sql",
  "20260403000000_add_electronic_signature.sql",
  "20260531000006_security_invoker_views.sql",
  "20260603020000_zkp_commitments.sql",
  "20260603020001_edge_devices_events.sql",
  "20260604000001_vehicle_prediction_data_infra.sql",
  "20260719000000_fix_rls_membership_references.sql",
];
const DUMP_TO = value("--dump");
const KEEP = flag("--keep");

/**
 * postgres は root では起動しない。root で動いているときだけ `su postgres` を挟む。
 * CI（GitHub Actions）は非 root の runner ユーザなので、そのまま実行する。
 */
const AS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
function pg(cmd) {
  const full = `PATH=${PG_BIN}:$PATH ${cmd}`;
  return AS_ROOT ? ["su", ["postgres", "-c", full]] : ["sh", ["-c", full]];
}

/** 一時 PostgreSQL を立てる。DSN を渡された場合は何もしない */
function startTempPostgres() {
  const base = mkdtempSync(join(tmpdir(), "pgreplay-"));
  const data = join(base, "data");
  const port = 5000 + Math.floor(process.pid % 50000);
  const asPostgres = (cmd) => {
    const [bin, args] = pg(cmd);
    return execFileSync(bin, args, { stdio: "pipe" });
  };

  if (AS_ROOT) execFileSync("chown", ["-R", "postgres:postgres", base]);
  asPostgres(`initdb -D ${data} -U postgres --auth=trust`);
  asPostgres(`pg_ctl -D ${data} -o '-p ${port} -k ${base}' -l ${base}/log start -w`);
  return {
    dsn: `postgresql://postgres@localhost:${port}/postgres?host=${base}`,
    stop() {
      try {
        asPostgres(`pg_ctl -D ${data} stop -m immediate`);
      } catch {
        /* 既に落ちている */
      }
      if (!KEEP) rmSync(base, { recursive: true, force: true });
    },
    base,
  };
}

/**
 * psql を1ファイル分回す。成功なら null、失敗ならエラーメッセージの1行目。
 *
 * `CREATE INDEX CONCURRENTLY` はトランザクションの中で実行できない。
 * このリポジトリは lint-migrations で CONCURRENTLY を**必須**にしているので、
 * 該当ファイルだけは `--single-transaction` を外す（外さないと全部落ちる）。
 */
function runSql(dsn, file) {
  const concurrently = /\bCONCURRENTLY\b/i.test(readFileSync(file, "utf8"));
  const tx = concurrently ? "" : "--single-transaction ";
  // ON_ERROR_STOP=1 で最初のエラーで止める。1ファイル=1トランザクションにして、
  // 途中まで通ったファイルが半端な状態を残さないようにする
  const [bin, args] = pg(`psql "${dsn}" -v ON_ERROR_STOP=1 ${tx}-q -f ${file}`);
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status === 0) return null;
  const err = `${r.stderr ?? ""}`.trim().split("\n").filter(Boolean);
  const line = err.find((l) => l.includes("ERROR:")) ?? err[0] ?? "unknown error";
  return line.replace(/^psql:[^:]+:\d+:\s*/, "").trim();
}

/**
 * `SET search_path = ''` の SECURITY DEFINER 関数が、本体でスキーマ非修飾の
 * テーブルを参照していないか。
 *
 * search_path が空だと非修飾の識別子は解決できないので、この形の関数は
 * **呼ぶと必ず 42P01 で落ちる**。しかも落ちるのは実行時なので、マイグレーションは
 * 通るし型検査も素通りする —— 実際 `insurer_accessible_tenant_ids` と
 * `is_pii_disclosed` が本番で壊れたまま5か月気づかれなかった
 * （20260404000000 が search_path を締めたとき、本体の修飾を忘れた）。
 *
 * ponytail: FROM/JOIN/INTO/UPDATE の直後の識別子だけを見る単純な走査。CTE や
 * 関数呼び出しも拾うが、public に同名の実体があるものだけに絞るので誤検知は
 * 実用上出ない。上限は「動的 SQL の中の参照は見えない」こと。
 */
const QUALREF_SCAN = `
  WITH f AS (
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND 'search_path=""' = ANY(coalesce(p.proconfig, '{}'))
  ), refs AS (
    SELECT f.proname, lower(m[1]) AS rel
    FROM f, regexp_matches(f.def, '(?i)(?:\\mfrom|\\mjoin|\\minto|\\mupdate)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)', 'g') AS m
  )
  SELECT r.proname || ' -> ' || string_agg(DISTINCT r.rel, ', ' ORDER BY r.rel)
  FROM refs r
  JOIN pg_class c ON c.relname = r.rel
  JOIN pg_namespace cn ON cn.oid = c.relnamespace AND cn.nspname = 'public'
  GROUP BY r.proname ORDER BY 1;
`.replace(/\s+/g, " ");

/** psql に SQL を1つ渡して stdout を返す。失敗なら null。 */
function psqlCapture(dsn, sql, quiet = true) {
  const [bin, args] = pg(`psql "${dsn}" -Atq ${quiet ? "" : ""}-c "${sql.replace(/"/g, '\\"')}"`);
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) return null;
  return `${r.stdout ?? ""}`;
}

/**
 * `SET search_path = ''` の SECURITY DEFINER 関数が、本体でスキーマ非修飾の
 * テーブルを参照していないか。
 *
 * search_path が空だと非修飾の識別子は解決できないので、この形の関数は
 * **呼ぶと必ず 42P01 で落ちる**。しかも落ちるのは実行時なので、マイグレーションは
 * 通るし型検査も素通りする —— 実際 `insurer_accessible_tenant_ids` と
 * `is_pii_disclosed` が本番で壊れたまま気づかれず、保険会社ポータルの検索3本が
 * 動かなくなっていた（20260404000000 が search_path を締めたとき、本体の修飾を
 * 忘れた）。
 *
 * この形は CREATE では作れない（`check_function_bodies` が本体を検証して弾く）。
 * 入り込む経路は「正常に作ったあとで ALTER FUNCTION ... SET search_path=''」だけ。
 * 自己検査もその経路で作る。
 *
 * ponytail: FROM/JOIN/INTO/UPDATE の直後の識別子だけを見る単純な走査。CTE や
 * 関数呼び出しも拾うが、public に同名の実体があるものだけに絞るので誤検知は
 * 実用上出ない。上限は「動的 SQL の中の参照は見えない」こと。
 */
function checkQualifiedRefs(dsn) {
  // 検査が空振りしていないことの確認。わざと壊した関数を1本作って、拾えるか見る。
  const probe = [
    "CREATE TABLE public.__qualref_probe(id int);",
    "CREATE FUNCTION public.__qualref_probe_fn() RETURNS SETOF int LANGUAGE sql STABLE SECURITY DEFINER AS 'SELECT id FROM __qualref_probe';",
    "ALTER FUNCTION public.__qualref_probe_fn() SET search_path = '';",
  ].join(" ");
  const cleanup = "DROP FUNCTION IF EXISTS public.__qualref_probe_fn(); DROP TABLE IF EXISTS public.__qualref_probe;";

  try {
    if (psqlCapture(dsn, probe) === null) {
      console.log("\n非修飾参照の検査を準備できませんでした（probe の作成に失敗）");
      return false;
    }
    const probed = psqlCapture(dsn, QUALREF_SCAN);
    if (probed === null || !probed.includes("__qualref_probe_fn")) {
      console.log("\n非修飾参照の検査が機能していません（わざと壊した関数を検出できませんでした）");
      return false;
    }
  } finally {
    psqlCapture(dsn, cleanup);
  }

  const out = psqlCapture(dsn, QUALREF_SCAN);
  if (out === null) {
    console.log("\n非修飾参照の検査を実行できませんでした");
    return false;
  }
  const hits = out.trim().split("\n").filter(Boolean);
  if (hits.length === 0) return true;

  console.log("\n❌ search_path='' の SECURITY DEFINER 関数が非修飾のテーブルを参照しています（呼ぶと 42P01 で落ちます）:");
  for (const h of hits) console.log(`  - ${h}`);
  console.log("本体の参照を public. で修飾してください。");
  return false;
}

function main() {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error("マイグレーションが見つかりません");
    process.exit(1);
  }

  const given = value("--dsn");
  const server = given ? null : startTempPostgres();
  const dsn = given ?? server.dsn;

  try {
    const bootErr = runSql(dsn, BOOTSTRAP);
    if (bootErr) {
      console.error(`bootstrap.sql が流せません: ${bootErr}`);
      process.exit(1);
    }

    let remaining = files.map((f) => ({ file: f, error: null }));
    let pass = 0;
    const applied = [];

    // 進捗がある限り回す。順序の前後は多重パスで吸収する
    while (remaining.length > 0) {
      pass += 1;
      const next = [];
      for (const item of remaining) {
        const err = runSql(dsn, join(MIGRATIONS, item.file));
        if (err === null) applied.push(item.file);
        // 最初のエラーを覚えておく。多重パスだと後から流れたファイルの副作用で
        // エラーが変わり（「戻り値の型は変えられない」など）、本当の原因が隠れる
        else next.push({ file: item.file, error: err, firstError: item.firstError ?? err });
      }
      const progress = remaining.length - next.length;
      console.log(`pass ${pass}: 適用 ${progress} 件 / 残り ${next.length} 件`);
      remaining = next;
      if (progress === 0) break;
    }

    console.log("");
    console.log(`適用できたファイル: ${applied.length} / ${files.length}`);

    if (remaining.length > 0) {
      console.log(`\n何周しても通らないファイル ${remaining.length} 件:`);
      for (const { file, error, firstError } of remaining) {
        const known = KNOWN_UNREPLAYABLE.includes(file) ? "（既知）" : "★新規★";
        console.log(`  - ${known} ${file}\n      ${error}`);
        if (firstError && firstError !== error) console.log(`      （1周目: ${firstError}）`);
      }
    }

    // 既知の一覧との差分だけを合否にする。既知が減っていたら一覧を更新させる
    const failed = remaining.map((r) => r.file);
    const unexpected = failed.filter((f) => !KNOWN_UNREPLAYABLE.includes(f));
    const fixed = KNOWN_UNREPLAYABLE.filter((f) => !failed.includes(f));

    if (unexpected.length > 0) {
      console.log(`\n❌ 新しく再生できなくなったファイルが ${unexpected.length} 件あります:`);
      for (const f of unexpected) console.log(`  - ${f}`);
      console.log("\n新しいマイグレーションは空 DB から再生できる必要があります。");
      console.log("既存ファイルへの依存で落ちている場合は、依存先を同じファイル内で作るか、");
      console.log("本番にしか無いオブジェクトなら repair マイグレーションに足してください。");
      process.exitCode = 1;
      return;
    }
    if (fixed.length > 0) {
      console.log(`\n✅ 再生できるようになったファイルが ${fixed.length} 件あります。`);
      console.log("scripts/replay-migrations.mjs の KNOWN_UNREPLAYABLE から消してください:");
      for (const f of fixed) console.log(`  - ${f}`);
      process.exitCode = 1;
      return;
    }
    if (remaining.length > 0) {
      console.log(`\n再生 OK（既知の ${remaining.length} 件を除く。増減なし）`);
      if (!checkQualifiedRefs(dsn)) process.exitCode = 1;
      return;
    }

    if (!checkQualifiedRefs(dsn)) {
      process.exitCode = 1;
      return;
    }

    if (DUMP_TO) {
      const [dbin, dargs] = pg(`pg_dump "${dsn}" --schema-only --schema=public --no-owner --no-acl`);
      const out = execFileSync(dbin, dargs, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
      writeFileSync(DUMP_TO, out);
      console.log(`スキーマを書き出しました: ${DUMP_TO}`);
    }
    console.log("\n再生 OK");
  } finally {
    if (server) {
      if (KEEP) console.log(`DB を残しました: ${server.base}`);
      server.stop();
    }
  }
}

if (!existsSync(BOOTSTRAP)) {
  console.error(`bootstrap.sql がありません: ${BOOTSTRAP}`);
  process.exit(1);
}
main();
