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
import {
  extractStructuredDates,
  isStructuredLine,
  isTooFarInFuture,
  unclosedFenceLine,
  TOLERANCE_DAYS,
} from "../check-context-dates.mjs";

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

  // 以下3つは、実際にリポジトリにあるのに取りこぼしていた形（PR #1027 の /code-review 指摘）。
  it("日付が `（` の直後に来ない見出しを拾う", () => {
    expect(
      extractStructuredDates("## 実装計画（UI/UX & Development Specification v2.0、2026-08-19〜）"),
    ).toEqual([{ line: 1, date: "2026-08-19" }]);
  });

  it("`・` を挟んだ見出しを拾う", () => {
    expect(extractStructuredDates("## Tap to Pay 本番リリースの残論点（App Store一般公開・2026-08-06）")).toEqual([
      { line: 1, date: "2026-08-06" },
    ]);
  });

  it("半角括弧の見出しを拾う", () => {
    expect(extractStructuredDates("## 決定的フォールバック(2026-07-18)のカバレッジ実測")).toEqual([
      { line: 1, date: "2026-07-18" },
    ]);
  });

  it("見出しに日付が2つあれば両方拾う（どちらも主張された日付）", () => {
    expect(extractStructuredDates("## 会社名と category に保存先が無い（2026-08-23 / 2026-08-24 縮小）")).toEqual([
      { line: 1, date: "2026-08-23" },
      { line: 1, date: "2026-08-24" },
    ]);
  });

  it("`###` などの深い見出しも拾う", () => {
    expect(extractStructuredDates("###### 2026-09-04 深い見出し")).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  it("9項目の `1. 日付: 2026-09-04` を拾う", () => {
    expect(extractStructuredDates("1. 日付: 2026-09-04")).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  it("`- 起票日: 2026-09-04` を拾う", () => {
    expect(extractStructuredDates("- 起票日: 2026-09-04")).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  // 全角コロンは**どちらの分岐にも掛からず素通り**していた。未来日が検査されない
  // 逆向きの穴（PR #1027 の `/code-review` 指摘）。
  it("全角コロンの日付フィールドを拾う", () => {
    expect(extractStructuredDates("1. 日付：2026-09-05")).toEqual([{ line: 1, date: "2026-09-05" }]);
    expect(extractStructuredDates("- 起票日： 2026-09-05")).toEqual([{ line: 1, date: "2026-09-05" }]);
  });

  // 値が日付でない行。ラベルだけで「構造化行」とみなすと、抽出0件との突き合わせで
  // 「取りこぼし」と誤検出し、**pre-commit フックが正しい文書を止める**。
  it("日付フィールドの値が日付でない行は対象外", () => {
    expect(extractStructuredDates("- 起票日: 未定（2026-09-30 に再検討）")).toEqual([]);
    expect(isStructuredLine("- 起票日: 未定（2026-09-30 に再検討）")).toBe(false);
  });

  it("本文中の日付は拾わない（M-011 の記述が落とされないこと）", () => {
    const body = [
      "実際 2026-09-03 に、2日先の `2026-09-05` を6つのソースコメントと",
      "事業ログ4ファイルに書いた（MISTAKE_LEDGER M-011）。",
      "起票日は 2026-09-03 だった。", // 行頭が `- 起票日:` ではないので対象外
    ].join("\n");
    expect(extractStructuredDates(body)).toEqual([]);
  });

  // フェンスの中にはシェルコメント `# 2026-12-31 …` が入りうる。見出しとして扱うと
  // **正しい文書がこの検査に落とされる**（pre-commit フックなのでコミットが止まる）。
  // PR #1027 の /code-review 指摘。
  it("コードフェンスの中は見ない", () => {
    const text = [
      "## 2026-09-04 本物の見出し",
      "",
      "```bash",
      "# 2026-12-31 未来日のシェルコメント",
      "#foo 2026-12-30 見出しでない # 行",
      "```",
    ].join("\n");
    expect(extractStructuredDates(text)).toEqual([{ line: 1, date: "2026-09-04" }]);
  });

  it("フェンスが閉じたあとは通常どおり拾う", () => {
    const text = ["```", "# 2026-12-31 フェンス内", "```", "## 2026-09-04 フェンス後の見出し"].join("\n");
    expect(extractStructuredDates(text)).toEqual([{ line: 4, date: "2026-09-04" }]);
  });

  // 単純なトグルだと、内側の ``` で状態が反転し「フェンスの外」と誤認する。
  // その結果、内側の未来日つき見出しが検査され、**正しい文書が落ちる**。
  // PR #1027 の `/code-review` 指摘。
  it("入れ子のフェンス（```` の中の ```）で状態が反転しない", () => {
    const text = [
      "````markdown",
      "```bash",
      "# 2026-12-31 内側のシェルコメント",
      "```",
      "## 2026-12-30 フェンス内の見出し例",
      "````",
      "## 2026-09-04 フェンス後の本物の見出し",
    ].join("\n");
    expect(extractStructuredDates(text)).toEqual([{ line: 7, date: "2026-09-04" }]);
  });

  // CommonMark の閉じ記号は**情報文字列を持てない**。長さと文字だけで閉じ判定すると、
  // 外側 ``` の中に例として書いた ````js の行が外側を閉じ、続く見出しが検査に晒され、
  // 本物の閉じ記号が「閉じ忘れ」に見える。つまり**正しい文書を落とす**。
  // Codex レビュー指摘（PR #1027、マージ後に #1040 で修正）。
  it("情報文字列つきの行は閉じ記号にならない", () => {
    const text = [
      "````",
      "````js", // 同じ長さ・同じ文字だが情報文字列つき → 閉じ記号ではない
      "## 2026-12-30 フェンス内の見出し例",
      "````", // これが本物の閉じ記号
      "## 2026-09-04 フェンス後の本物の見出し",
    ].join("\n");
    expect(extractStructuredDates(text)).toEqual([{ line: 5, date: "2026-09-04" }]);
    expect(unclosedFenceLine(text)).toBe(0);
  });

  it("チルダのフェンスも閉じる", () => {
    const text = ["~~~", "# 2026-12-31 フェンス内", "~~~", "## 2026-09-04 フェンス後"].join("\n");
    expect(extractStructuredDates(text)).toEqual([{ line: 4, date: "2026-09-04" }]);
  });
});

describe("unclosedFenceLine（閉じ忘れたフェンス）", () => {
  // 閉じ忘れると以降の全行が黙って検査対象から外れる。0件チェックは他ファイルの
  // 日付で通るので、これを別に失敗させないと**検査が空振りしたことに気づけない**。
  it("閉じられていないフェンスの開始行を返す", () => {
    expect(unclosedFenceLine(["## 2026-09-04 見出し", "```bash", "# 何か"].join("\n"))).toBe(2);
  });

  it("閉じていれば 0", () => {
    expect(unclosedFenceLine(["```", "x", "```"].join("\n"))).toBe(0);
  });

  it("フェンスが無ければ 0", () => {
    expect(unclosedFenceLine("## 2026-09-04 見出し")).toBe(0);
  });

  it("行番号を正しく返す", () => {
    const text = ["# タイトル", "", "## 2026-09-04 一件目", "本文", "## 2026-09-01 二件目"].join("\n");
    expect(extractStructuredDates(text)).toEqual([
      { line: 3, date: "2026-09-04" },
      { line: 5, date: "2026-09-01" },
    ]);
  });
});

describe("isStructuredLine（本体の突き合わせ用・抽出とは別実装）", () => {
  // 本体はこの判定と抽出結果を突き合わせ、「日付が書かれているのに抽出されていない行」を
  // 失敗にする。抽出器が狭まったときに 0 件チェックでは見えない取りこぼしを捕まえるため、
  // **抽出と同じ正規表現を使ってはいけない**。ここでそのことを固定する。
  it("見出しと日付フィールドを true にする", () => {
    expect(isStructuredLine("## 2026-09-04 タイトル")).toBe(true);
    expect(isStructuredLine("###### 深い見出し")).toBe(true);
    expect(isStructuredLine("1. 日付: 2026-09-04")).toBe(true);
    expect(isStructuredLine("- 起票日: 2026-09-04")).toBe(true);
  });

  it("本文行を false にする", () => {
    expect(isStructuredLine("実際 2026-09-03 に、2日先の 2026-09-05 を書いた")).toBe(false);
    expect(isStructuredLine("- 起票日は決まっていない")).toBe(false);
    expect(isStructuredLine("2. 起きたこと: 2026-09-04 に着手した")).toBe(false);
  });

  // `#` の直後に空白が無い行は見出しではない。以前は `startsWith("#")` だったため
  // PR 番号を書いた本文が「抽出器の取りこぼし」として誤検出され、**正しい文書で
  // pre-commit フックが止まった**（PR #1027 の `/code-review` 指摘）。
  it("`#` の直後に空白が無い行は見出しではない", () => {
    expect(isStructuredLine("#1031 は 2026-09-04 にマージした")).toBe(false);
    expect(isStructuredLine("####### 2026-09-04 は7個なので見出しではない")).toBe(false);
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
