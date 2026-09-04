/**
 * `scripts/check-context-dates.mjs` の**抽出部分**のテスト。
 *
 * なぜ要るか: この検査が拾うのは「そのエントリ自身が主張する日付」だけで、
 * 本文中の言及は拾ってはいけない。MISTAKE_LEDGER M-011 の記述そのものが
 * 「2日先の 2026-09-05 を書いた」という**未来日を含む本文**なので、
 * 区別を間違えると**失敗の記録が検査に落とされる**。
 *
 * 逆に、パターンが実際の見出しの書き方に追いつけなくなると抽出が0件になり、
 * 検査は永久に緑のままになる（MISTAKE_LEDGER 型 A）。本体側は0件を失敗に
 * するが、「本来3件のうち1件しか拾えていない」は0件チェックでは分からない。
 * ここで書式ごとに1件ずつ固定する。
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs に型定義は無い。検査対象は実行時の挙動。
import { extractStructuredDates, isTooFarInFuture, TOLERANCE_DAYS } from "../check-context-dates.mjs";

describe("extractStructuredDates（構造化された日付の抽出）", () => {
  it("DECISION_LOG 形式の見出し `## 2026-09-04 タイトル` を拾う", () => {
    expect(extractStructuredDates("## 2026-09-04 遷移表の未解決4件を代表判断で解決")).toEqual([
      { line: 1, date: "2026-09-04" },
    ]);
  });

  it("OPEN_QUESTIONS 形式の見出し `## タイトル（2026-09-04）` を拾う", () => {
    expect(extractStructuredDates("## 通知の既読はテナント共有でよいか（2026-09-04）")).toEqual([
      { line: 1, date: "2026-09-04" },
    ]);
  });

  it("MISTAKE_LEDGER 形式の `## M-017 タイトル（2026-09-04・型 B）` を拾う（括弧内に続きがある）", () => {
    expect(extractStructuredDates("## M-017 件数上限を費用の安全装置と読んだ（2026-09-04・型 B）")).toEqual([
      { line: 1, date: "2026-09-04" },
    ]);
  });

  it("9項目の `1. 日付: 2026-09-04` を拾う", () => {
    expect(extractStructuredDates("1. 日付: 2026-09-04")).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  it("`- 起票日: 2026-09-04` を拾う", () => {
    expect(extractStructuredDates("- 起票日: 2026-09-04")).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  it("本文中の日付は拾わない（M-011 の記述が落とされないこと）", () => {
    const body = [
      "実際 2026-09-03 に、2日先の `2026-09-05` を6つのソースコメントと",
      "事業ログ4ファイルに書いた（MISTAKE_LEDGER M-011）。",
      "起票日は 2026-09-03 だった。", // 行頭が `- 起票日:` ではないので対象外
    ].join("\n");
    expect(extractStructuredDates(body)).toEqual([]);
  });

  it("同じ行を2回報告しない", () => {
    // 見出し形式と括弧形式の両方に当たりうる行。1件だけ返す。
    expect(extractStructuredDates("## 2026-09-04 決めたこと（2026-09-01 起票分）")).toHaveLength(1);
  });

  it("行番号を正しく返す", () => {
    const text = ["# タイトル", "", "## 2026-09-04 一件目", "本文", "## 2026-09-01 二件目"].join("\n");
    expect(extractStructuredDates(text)).toEqual([
      { line: 3, date: "2026-09-04" },
      { line: 5, date: "2026-09-01" },
    ]);
  });
});

describe("isTooFarInFuture（未来日の判定）", () => {
  const today = "2026-09-04";

  it("過去の日付は通す（遡及追記は正当な操作）", () => {
    expect(isTooFarInFuture("2026-08-01", today)).toBe(false);
  });

  it("今日は通す", () => {
    expect(isTooFarInFuture(today, today)).toBe(false);
  });

  it("1日先は通す（JST 等の時差ぶんの許容）", () => {
    expect(isTooFarInFuture("2026-09-05", today)).toBe(false);
  });

  it("2日先は落とす（M-011 が実際にこの形だった）", () => {
    expect(isTooFarInFuture("2026-09-06", today)).toBe(true);
  });

  it("月をまたぐ加算が正しい（月末＋許容日）", () => {
    // 09-30 + 1 = 10-01。文字列比較だけだと "2026-09-31" のような
    // 存在しない日付を境界にしてしまう。
    expect(isTooFarInFuture("2026-10-01", "2026-09-30")).toBe(false);
    expect(isTooFarInFuture("2026-10-02", "2026-09-30")).toBe(true);
  });

  it("年をまたぐ加算が正しい", () => {
    expect(isTooFarInFuture("2027-01-01", "2026-12-31")).toBe(false);
    expect(isTooFarInFuture("2027-01-02", "2026-12-31")).toBe(true);
  });

  it("許容日数は 1（変えたらこのテストで気づく）", () => {
    expect(TOLERANCE_DAYS).toBe(1);
  });
});
