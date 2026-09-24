import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs スクリプトには型定義が無い
import { parseTsActions, parseSqlActions, findVocabProblems } from "./check-audit-action-vocab.mjs";

/**
 * この検査が本当に「あの失敗」を捕まえるかを確かめるテスト。
 * 検査そのものを検証していないと、緑なのに素通りしている状態に気づけない
 * （CLAUDE.md「判断の道具そのものを検証する」）。
 *
 * 捕まえたい失敗: 2026-09-23 まで `insurer_access_logs.action` の語彙が
 * DB の CHECK にしか無く、コードが書く 16 種を弾いていた。保険会社ポータルの
 * 6エンドポイントが本番で落ち続けた（DECISION_LOG 2026-09-23）。
 */

const TS_SRC = `
export const INSURER_ACCESS_ACTIONS = [
  // --- SQL 関数が書く
  "view",
  "search",
  // --- ドット区切り（[a-z_]+ の正規表現では拾えなかった形）
  "insurer.export.csv",
] as const;
`;

const SQL_SRC = `
  v_actions text[] := ARRAY[
    'view','search',
    -- コメント内の 'dummy' は拾わない
    'insurer.export.csv'
  ];
`;

describe("check-audit-action-vocab", () => {
  it("型と SQL の一覧を同じ集合として読む", () => {
    const ts = parseTsActions(TS_SRC);
    const sql = parseSqlActions(SQL_SRC);
    expect(ts).toEqual(["view", "search", "insurer.export.csv"]);
    expect(sql).toEqual(["view", "search", "insurer.export.csv"]);
    expect(findVocabProblems(ts, sql)).toEqual([]);
  });

  it("ドット区切りの値を落とさない（前回これで3つ取りこぼした）", () => {
    expect(parseTsActions(TS_SRC)).toContain("insurer.export.csv");
    expect(parseSqlActions(SQL_SRC)).toContain("insurer.export.csv");
  });

  it("コメント内の文字列を値として拾わない", () => {
    expect(parseSqlActions(SQL_SRC)).not.toContain("dummy");
    expect(parseTsActions(TS_SRC)).not.toContain("SQL 関数が書く");
  });

  it("型にだけ足した値を検出する（CHECK を広げ忘れる形）", () => {
    const problems = findVocabProblems(["view", "brand_new"], ["view"]);
    expect(problems.join("\n")).toContain("brand_new");
  });

  it("検査にだけ残った値を検出する（型から消した形）", () => {
    const problems = findVocabProblems(["view"], ["view", "stale_action"]);
    expect(problems.join("\n")).toContain("stale_action");
  });

  it("重複を検出する", () => {
    expect(findVocabProblems(["view", "view"], ["view"]).join("\n")).toContain("重複");
  });

  it("読み取りが壊れて空になったら「一致」と読まない", () => {
    const problems = findVocabProblems([], []);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("読めなかった");
  });

  it("配列を見つけられない入力では投げる（黙って空を返さない）", () => {
    expect(() => parseTsActions("const OTHER = [];")).toThrow();
    expect(() => parseSqlActions("-- 何も無い")).toThrow();
  });

  it("実ファイルの型と検査の一覧が一致している", async () => {
    const { readFileSync } = await import("node:fs");
    const ts = parseTsActions(readFileSync("src/lib/insurer/auditActions.ts", "utf8"));
    const sql = parseSqlActions(readFileSync("scripts/replay/checks/insurer_access_logs_action_vocab.sql", "utf8"));
    expect(ts.length).toBeGreaterThan(0);
    expect(findVocabProblems(ts, sql)).toEqual([]);
  });
});
