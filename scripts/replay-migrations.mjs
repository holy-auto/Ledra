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
