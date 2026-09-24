#!/usr/bin/env node
/**
 * `insurer_access_logs.action` の語彙が、型と再生検査でずれていないかを見る。
 *
 * 語彙は本来1箇所にしか書きたくないが、片方は TypeScript、もう片方は SQL なので
 * 物理的に2箇所ある。この検査がその2つを縛る。鎖はこうなっている:
 *
 *   src/lib/insurer/auditActions.ts の INSURER_ACCESS_ACTIONS   ← 書き手は tsc が縛る
 *     ↓ （このスクリプト）
 *   scripts/replay/checks/insurer_access_logs_action_vocab.sql の v_actions
 *     ↓ （npm run check:migrations が本物の Postgres で1値ずつ insert）
 *   DB の insurer_access_logs_action_check
 *
 * どれか1つを足し忘れたら、この検査かリプレイのどちらかが落ちる。
 *
 * 走らせ方: npm run check:audit-actions（CI の ci-parallel-checks.sh からも走る）
 */
import { readFileSync } from "node:fs";

const TS_PATH = "src/lib/insurer/auditActions.ts";
const SQL_PATH = "scripts/replay/checks/insurer_access_logs_action_vocab.sql";

/** `export const INSURER_ACCESS_ACTIONS = [ ... ] as const;` の中の "..." を拾う。 */
export function parseTsActions(src) {
  const m = src.match(/export const INSURER_ACCESS_ACTIONS = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error(`${TS_PATH}: INSURER_ACCESS_ACTIONS の配列を見つけられない`);
  // 行コメント（// ---）を落としてから文字列リテラルを拾う。
  const body = m[1].replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** `v_actions text[] := ARRAY[ ... ];` の中の '...' を拾う。 */
export function parseSqlActions(src) {
  const m = src.match(/v_actions text\[\] := ARRAY\[([\s\S]*?)\];/);
  if (!m) throw new Error(`${SQL_PATH}: v_actions の配列を見つけられない`);
  const body = m[1].replace(/--[^\n]*/g, "");
  return [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/**
 * 2つの一覧を突き合わせる。問題が無ければ空配列。
 * ファイル読み取りから切り離してあるのは、テストから呼べるようにするため。
 */
export function findVocabProblems(ts, sql) {
  const problems = [];
  // 空配列を「一致」と読まない。正規表現が壊れたら差分ゼロで通ってしまう。
  if (ts.length === 0) problems.push(`${TS_PATH} から値を1つも読めなかった。読み取りが壊れている`);
  if (sql.length === 0) problems.push(`${SQL_PATH} から値を1つも読めなかった。読み取りが壊れている`);
  if (problems.length) return problems;

  const dupTs = [...new Set(ts.filter((v, i) => ts.indexOf(v) !== i))];
  if (dupTs.length) problems.push(`${TS_PATH} に重複: ${dupTs.join(", ")}`);
  const dupSql = [...new Set(sql.filter((v, i) => sql.indexOf(v) !== i))];
  if (dupSql.length) problems.push(`${SQL_PATH} に重複: ${dupSql.join(", ")}`);

  const tsSet = new Set(ts);
  const sqlSet = new Set(sql);
  const onlyTs = ts.filter((v) => !sqlSet.has(v));
  const onlySql = sql.filter((v) => !tsSet.has(v));

  if (onlyTs.length) {
    problems.push(
      `型にあって検査に無い: ${onlyTs.join(", ")}\n` +
        `    → ${SQL_PATH} の v_actions に足す。CHECK を広げるマイグレーションも同じ PR に要る`,
    );
  }
  if (onlySql.length) {
    problems.push(
      `検査にあって型に無い: ${onlySql.join(", ")}\n` +
        `    → ${TS_PATH} の INSURER_ACCESS_ACTIONS に足すか、検査側から消す`,
    );
  }
  return problems;
}

function main() {
  const ts = parseTsActions(readFileSync(TS_PATH, "utf8"));
  const sql = parseSqlActions(readFileSync(SQL_PATH, "utf8"));
  const problems = findVocabProblems(ts, sql);

  if (problems.length) {
    console.error(["check-audit-action-vocab: 語彙がずれている", ...problems.map((p) => `  ${p}`)].join("\n"));
    process.exit(1);
  }

  console.log(`check-audit-action-vocab: OK（${ts.length} 種が型と検査で一致）`);
}

// テストから import されたときは実行しない。
if (process.argv[1] && process.argv[1].endsWith("check-audit-action-vocab.mjs")) main();
