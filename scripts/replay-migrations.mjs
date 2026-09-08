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
 *   2. supabase/migrations/*.sql を**ファイル名順に1パスで**流す
 *   3. 1本でも落ちたら、そのファイルと理由を全部出して失敗させる
 *
 * **1パスなのが要点。** Supabase のブランチ機能（PR ごとのプレビュー DB）は
 * ファイル名順に1回だけ流すので、多重パスで通ることには意味が無い。
 * 以前はここが多重パスで、順序の逆転を「吸収」していたため、Supabase Preview だけが
 * 赤いのに CI は緑、という状態が続いていた（2026-09-03 に 203 本の順序逆転を解消）。
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
 * 役割を見ない RLS ポリシーが、役割別ポリシーを打ち消していないか検査する。
 *
 * PostgreSQL は同一コマンドの PERMISSIVE ポリシーを **OR** で評価する。役割で絞る
 * ポリシーを足しても、テナント所属だけを見る古いポリシーが残っていれば絞り込みは
 * 一度も効かない。2026-09-01 に本番で certificates / vehicles / vehicle_histories /
 * nfc_tags / templates の計14組がこの状態にあり、viewer が作成・更新・削除できていた。
 *
 * なぜ再生 DB を見るのか: v2 系ポリシーは plpgsql の EXECUTE format() で名前もテーブルも
 * 動的に組み立てられるため、マイグレーション本文の静的解析では拾えない（試して失敗した）。
 * 実際に流した結果の pg_policies を見るのが唯一確実。
 *
 * `FOR ALL` は全コマンドに掛かるので各コマンドに展開する（コマンド別に数えると
 * 取りこぼす。最初の調査で実際に取りこぼした）。
 * 保険会社系（my_insurer_ids 等）は別主体の OR が正当なので対象外。
 */
function checkRlsPolicyNullification(dsn) {
  const query = `
    with pol as (
      select tablename, policyname, cmd, coalesce(qual, with_check, '') as expr
      from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
    ), cmds(c) as (values ('INSERT'), ('UPDATE'), ('DELETE')),
    app as (
      select p.tablename, c.c as cmd, p.policyname, p.expr
      from pol p join cmds c on p.cmd = c.c or p.cmd = 'ALL'
    ), tagged as (
      select tablename, cmd, policyname,
        (expr ~ 'my_tenant_role|member_role_in_tenant') as role_aware,
        (expr ~ 'my_tenant_ids|is_member_of_tenant|tenant_memberships') as tenant_scoped
      from app
    )
    select tablename, cmd, string_agg(policyname, ' ' order by policyname) filter (where not role_aware)
    from tagged where tenant_scoped
    group by tablename, cmd
    having count(*) filter (where role_aware) > 0 and count(*) filter (where not role_aware) > 0
    order by 1, 2;`;
  // クエリはファイル経由で渡す。pg() は sh -c を通すので、-c に複数行の文字列を直接
  // 渡すと改行がリテラルの \n になり psql のメタコマンドとして解釈される。
  const qfile = join(tmpdir(), `rlscheck-${process.pid}.sql`);
  writeFileSync(qfile, query);
  let rows;
  try {
    const [bin, args] = pg(`psql "${dsn}" -A -t -F"|" -q -f ${qfile}`);
    const r = spawnSync(bin, args, { encoding: "utf8" });
    if (r.status !== 0) return { error: `${r.stderr ?? ""}`.trim().split("\n")[0] };
    rows = `${r.stdout ?? ""}`
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [table, cmd, names] = l.split("|");
        return { table, cmd, names: (names ?? "").split(" ").filter(Boolean) };
      });
  } finally {
    rmSync(qfile, { force: true });
  }

  // 1パスなので、後で DROP されたポリシーは最終状態の pg_policies に残らない。
  // （多重パスだった頃は CREATE と DROP の順序が入れ替わり、除外処理が要った）
  return { rows: rows.map((row) => `${row.table}.${row.cmd} : ${row.names.join(", ")}`) };
}

/**
 * psql に SQL を1本流す。`{ out }` か `{ error }` を返す。
 * クエリはファイル経由（pg() は sh -c を通すので -c に複数行を渡すと改行が壊れる）。
 * ON_ERROR_STOP=1 を付けないと、途中のエラーを飛ばして終了コード 0 で返ってくる。
 */
function psqlRun(dsn, sql) {
  const f = join(tmpdir(), `qualref-${process.pid}.sql`);
  writeFileSync(f, sql);
  try {
    const [bin, args] = pg(`psql "${dsn}" -v ON_ERROR_STOP=1 -A -t -q -f ${f}`);
    const r = spawnSync(bin, args, { encoding: "utf8" });
    if (r.status !== 0) {
      const err = `${r.stderr ?? ""}`.trim().split("\n").filter(Boolean);
      return { error: err.find((l) => l.includes("ERROR:")) ?? err[0] ?? "unknown error" };
    }
    return { out: `${r.stdout ?? ""}` };
  } finally {
    rmSync(f, { force: true });
  }
}

/**
 * `SET search_path = ''` の SECURITY DEFINER 関数が、本体で解決できない名前を
 * 参照していないか検査する。
 *
 * search_path が空だと非修飾の識別子は解決できないので、この形の関数は**呼ぶと
 * 必ず落ちる**（テーブルなら 42P01）。落ちるのは実行時なので、マイグレーションは
 * 通り型検査も素通りする —— 実際 `insurer_accessible_tenant_ids` と
 * `is_pii_disclosed` の2本が本番で壊れたまま残り、前者は保険会社ポータルの検索3本
 * （insurer_search_certificates / _stores / _vehicles）を巻き込んで止めていた。
 * 後者の呼び出し元は insurer_get_certificate。どちらも 20260404000000 が
 * search_path を締めたときに本体の修飾を忘れたもの。
 *
 * この形は CREATE では作れない。`check_function_bodies` が、その関数自身の
 * SET 句を適用した状態で本体を検証して弾くからだ。入り込む経路は「正常に作った
 * あとで ALTER FUNCTION ... SET search_path=''」だけで、**ALTER は本体を
 * 再検証しない**。
 *
 * 検査はその性質をそのまま使う: 各関数の `pg_get_functiondef()` を**流し直す**。
 * 通れば健全、落ちればその関数は呼んでも落ちる。自前で本文を読むより確実で、
 * 非修飾のテーブルだけでなく非修飾の関数呼び出しや USING 句も同じ1回で拾える
 * （正規表現で本文を読んでいた版は、この2つを取りこぼし、逆にコメントや文字列
 * リテラル中の単語を参照と誤検知していた）。
 *
 * ponytail: LANGUAGE sql の本体に対しては完全。plpgsql の本体は
 * check_function_bodies が構文しか見ないので、その中の名前解決までは検証できない。
 * 上限はそこと、動的 SQL（EXECUTE format(...)）の中身。
 */
const QUALREF_SCAN = `
  begin;
  create temporary table __qualref_bad(proname text, detail text);
  do $qualref$
  declare r record;
  begin
    for r in
      select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and 'search_path=""' = any(coalesce(p.proconfig, '{}'))
      order by p.proname
    loop
      begin
        execute pg_get_functiondef(r.oid);
      exception when others then
        insert into __qualref_bad values (r.proname, sqlerrm);
      end;
    end loop;
  end
  $qualref$;
  select proname || ' -> ' || detail from __qualref_bad order by 1;
  -- 流し直しは同一定義の置き換えなので実害は無いが、検査が DB を書き換えないよう
  -- 巻き戻す。出力は既に得ているので rollback で失われない。
  rollback;`;

function checkQualifiedRefs(dsn) {
  // 検査が空振りしていないことの確認。**陽性と陰性を対で置く**（MISTAKE_LEDGER M-048)。
  // 陽性だけ置いた版は、健全な関数のコメントに書かれた `from ...` を参照と誤認して
  // CI を落とす誤検知に気づけなかった。
  //
  // 陽性: 本番と同じ経路（正常に作ってから ALTER）で壊した関数 → 検出されねばならない
  // 陰性: 本体は完全修飾で、コメントにだけ紛らわしい `from` がある → 検出されてはならない
  const probe = [
    "create table public.__qualref_probe(id int);",
    "create function public.__qualref_bad_fn() returns setof int language sql stable security definer as 'select id from __qualref_probe';",
    "alter function public.__qualref_bad_fn() set search_path = '';",
    "create function public.__qualref_ok_fn() returns setof int language sql stable security definer as $p$ -- read from __qualref_probe then join it\n select id from public.__qualref_probe; $p$;",
    "alter function public.__qualref_ok_fn() set search_path = '';",
  ].join("\n");
  const cleanup = [
    "drop function if exists public.__qualref_bad_fn();",
    "drop function if exists public.__qualref_ok_fn();",
    "drop table if exists public.__qualref_probe;",
  ].join("\n");

  try {
    const made = psqlRun(dsn, probe);
    if (made.error) return { error: `probe を作れませんでした: ${made.error}` };
    const probed = psqlRun(dsn, QUALREF_SCAN);
    if (probed.error) return { error: `probe 走査に失敗しました: ${probed.error}` };
    if (!probed.out.includes("__qualref_bad_fn")) {
      return { error: "わざと壊した関数を検出できませんでした（検査が機能していません）" };
    }
    if (probed.out.includes("__qualref_ok_fn")) {
      return { error: "健全な関数を誤検出しました（検査が厳しすぎます）" };
    }
  } finally {
    // 消し損ねると、本走査が __qualref_bad_fn を「壊れた関数」として報告し、
    // リポジトリのどこにも無い名前で CI が落ちる。失敗は握りつぶさない。
    const cleaned = psqlRun(dsn, cleanup);
    if (cleaned.error) console.log(`\n⚠️ probe の後始末に失敗しました: ${cleaned.error}`);
  }

  const scanned = psqlRun(dsn, QUALREF_SCAN);
  if (scanned.error) return { error: scanned.error };
  return { rows: scanned.out.trim().split("\n").map((l) => l.trim()).filter(Boolean) };
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

    // ファイル名順に1回だけ流す。Supabase のブランチ機能と同じ条件。
    // 落ちても止めずに最後まで進み、落ちたものを全部出す（1本ずつ直すのは遅い）。
    const failed = [];
    for (const file of files) {
      const err = runSql(dsn, join(MIGRATIONS, file));
      if (err !== null) failed.push({ file, error: err });
    }

    console.log(`適用できたファイル: ${files.length - failed.length} / ${files.length}`);

    if (failed.length > 0) {
      console.log(`\n❌ ファイル名順に1パスで流すと ${failed.length} 件落ちます:`);
      for (const { file, error } of failed) console.log(`  - ${file}\n      ${error}`);
      console.log("\nSupabase のブランチ機能はこの順で1回だけ流すので、ここが赤いと");
      console.log("プレビュー DB は作られません。前提は同じファイルの中で作るか、");
      console.log("前提が無いときに飛ばして別ファイルで補ってください");
      console.log("（新しいファイルは作らない。適用済みファイルの末尾に足す）。");
      console.log("\n（スキーマが未完成なので RLS ポリシー検査は行いません）");
      process.exitCode = 1;
      return;
    }

    // RLS: 役割別ポリシーが役割を見ないポリシーに打ち消されていないか
    const rls = checkRlsPolicyNullification(dsn);
    if (rls.error) {
      console.log(`\n⚠️ RLS ポリシー検査を実行できませんでした: ${rls.error}`);
    } else if (rls.rows.length > 0) {
      console.log(`\n❌ 役割を見ない RLS ポリシーが役割別ポリシーを打ち消しています（${rls.rows.length} 組）:`);
      for (const row of rls.rows) console.log(`  - ${row}`);
      console.log("\nPERMISSIVE ポリシーは OR で評価されます。役割で絞るポリシーを足すときは、");
      console.log("同じテーブル・同じコマンドの古い（役割を見ない）ポリシーを DROP してください。");
      process.exitCode = 1;
      return;
    } else {
      console.log("RLS ポリシー検査: 打ち消しなし");
    }

    // search_path='' の SECURITY DEFINER 関数が、本体で非修飾のテーブルを参照していないか
    const qualref = checkQualifiedRefs(dsn);
    if (qualref.error) {
      console.log(`\n⚠️ 非修飾参照の検査を実行できませんでした: ${qualref.error}`);
      process.exitCode = 1;
      return;
    } else if (qualref.rows.length > 0) {
      console.log(`\n❌ search_path='' の SECURITY DEFINER 関数が非修飾のテーブルを参照しています（${qualref.rows.length} 本）:`);
      for (const row of qualref.rows) console.log(`  - ${row}`);
      console.log("\n呼ぶと 42P01 で落ちます。本体の参照を public. で修飾してください。");
      process.exitCode = 1;
      return;
    } else {
      console.log("非修飾参照の検査: 該当なし");
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
