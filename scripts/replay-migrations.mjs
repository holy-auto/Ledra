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

  // 再生は「通らなかったファイルを次の周で流し直す」多重パスなので、あとで DROP する
  // マイグレーションより後に CREATE 側が流れることがある。本番は1回・順番どおりに
  // 流れるのでこれは再生だけの現象。ファイル名順で「CREATE より後に DROP がある」
  // ポリシーは再生の副産物として除外する。
  // ponytail: 「作って消してまた作る」ポリシーは誤って除外される。今そういう例は無い。
  const droppedLater = (name) => {
    let lastCreate = "";
    let lastDrop = "";
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      const re = (verb) => new RegExp(`${verb}\\s+policy\\s+(?:if\\s+exists\\s+)?"?${name}"?\\s+on`, "i");
      if (re("create").test(sql)) lastCreate = f;
      if (re("drop").test(sql)) lastDrop = f;
    }
    return lastCreate !== "" && lastDrop > lastCreate;
  };

  const real = [];
  for (const row of rows) {
    const names = row.names.filter((n) => !droppedLater(n));
    if (names.length > 0) real.push(`${row.table}.${row.cmd} : ${names.join(", ")}`);
  }
  return { rows: real };
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
