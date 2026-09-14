// 事業ログ（docs/context/）の構造化された日付が未来を指していないかの検査。
// 実行: node scripts/check-context-dates.mjs   （npm run check:context-dates）
//
// なぜ要るか: 2026-09-03 に、2日先の `2026-09-05` を事業ログ4ファイルと
// 6つのソースコメントに書いた（MISTAKE_LEDGER M-011）。マージ直前に人力で気づいた。
// DECISION_LOG の「1. 日付」は**その記録自体が唯一の出典**なので、誤ると後から
// 検証する手段が無い。コードコメントより実害が大きい。
//
// ## なぜ「コミット日との一致」ではなく「未来日の禁止」なのか
//
// 起票時の案は「追加された見出しの日付が `git log -1 --date=short` と一致するか」
// だった。これは2つの理由で採らなかった。
//
//   1. **遡及追記が正当な操作である。** 後から気づいた出来事を過去の日付で書くのは
//      正しい。一致を求めると `<!-- backdated: 理由 -->` のような免除が要り、
//      免除は抜け道になる（起票時点でその懸念も書かれていた）。
//   2. **一致は日をまたぐ PR で必ず落ちる。** 3日に書いて5日にマージされる PR の
//      見出しは3日で正しい。rebase・squash でコミット日はさらに動く。
//
// 未来日だけを禁じれば、M-011 の形（今日より先の日付を書く）は捕まえられて、
// 遡及追記は免除なしで通る。diff もベース ref も要らないので、
// checkout の fetch-depth にも依存しない。
//
// ## 対象は「構造化された日付」だけ
//
// 見出しと `1. 日付:` / `- 起票日:` フィールドだけを見る。本文中の日付は見ない。
// M-011 の記述そのもの（「2日先の 2026-09-05 を書いた」）が本文に残っており、
// 全部の日付を拾うとそれが落ちる。**失敗の記録が検査に落とされるのは本末転倒。**
//
// ponytail: 上限。時差ぶんの1日を許容している（下の TOLERANCE_DAYS）ので、
// 「1日だけ先」の誤りは捕まえられない。JST（UTC+9）で夕方以降に作業すると
// ローカル日付が UTC の1日先になるため、0日許容にすると正当な入力で落ちる。
// M-011 は2日先だったのでこの網にかかる。1日先まで捕まえたいなら、
// CLAUDE.md の `date -u` を実行させる形（環境から日付を取る）に寄せるしかない。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTEXT_DIR = join(repoRoot, "docs", "context");

/** 時差ぶんの許容（日）。理由は冒頭の ponytail を参照。 */
export const TOLERANCE_DAYS = 1;

const DATE = /\d{4}-\d{2}-\d{2}/g;

/**
 * 見出し行。**見出しの中の日付は、位置を問わず全部拾う。**
 *
 * 最初は書き方ごとに正規表現を並べていたが、実際の見出しを3つ取りこぼしていた
 * （PR #1027 の `/code-review` 指摘）。
 *
 *   - `## 実装計画（UI/UX & Development Specification v2.0、2026-08-19〜）`
 *     … 日付が `（` の直後に来ない
 *   - `## Tap to Pay 本番リリースの残論点（App Store一般公開・2026-08-06）` … 同上
 *   - `## 決定的フォールバック(2026-07-18)のカバレッジ実測` … 半角の `(`
 *
 * 括弧の種類や日付の位置を数え上げる方向は、**書き方が1つ増えるたびに穴が空く**。
 * 見出しに書かれた日付はどこにあってもそのエントリの日付なので、位置を見ない。
 * 1つの見出しに2つ日付がある形（`## …（2026-08-23 / 2026-08-24 縮小）`）も
 * 両方が主張された日付なので、両方を検査する。
 */
const HEADING = /^#{1,6} /;

/**
 * 見出し以外で「そのエントリ自身が主張する日付」を書く場所。
 * 本文中の言及（「2日先の 2026-09-05 を書いた」等）を拾わないよう行頭にアンカーする。
 */
const FIELD_PATTERNS = [
  // DECISION_LOG の9項目: `1. 日付: 2026-09-04`
  /^1\. 日付[:：]\s*(\d{4}-\d{2}-\d{2})\b/,
  // OPEN_QUESTIONS: `- 起票日: 2026-09-04`
  /^- 起票日[:：]\s*(\d{4}-\d{2}-\d{2})\b/,
];

/** 日付フィールドの行頭。値が日付かどうかは見ない（下の突き合わせ用）。 */
const FIELD_LABELS = [/^1\. 日付[:：]/, /^- 起票日[:：]/];

/**
 * その行が「日付を書く場所」か（下の突き合わせ用の、抽出とは別実装の判定）。
 *
 * 独立していることに意味があるので `HEADING` を使い回さない。ただし
 * **独立とは「広い」ことではない。** 最初は `startsWith("#")` にしていたが、
 * それは見出しの定義ではなく、本文の `#1031 は 2026-09-04 にマージした` のような行を
 * 「抽出器の取りこぼし」として誤検出する。**正しい文書がこの検査に落ち、
 * pre-commit フックでコミットが止まる**（PR #1027 の `/code-review` 指摘）。
 * CommonMark の見出しは `#` 1〜6個の**直後に空白**なので、そこまで見る。
 */
export function isStructuredLine(line) {
  const hashes = line.match(/^#+/);
  if (hashes) return hashes[0].length <= 6 && /^\s/.test(line.slice(hashes[0].length));
  // 日付フィールドは「ラベルの直後が日付」のときだけ対象。
  // ラベルだけで true にすると `- 起票日: 未定（2026-09-30 に再検討）` のような
  // **日付ではない値**の行を「抽出器の取りこぼし」と誤検出し、pre-commit フックが
  // 正しい文書を止める（PR #1027 の `/code-review` 指摘）。
  return FIELD_LABELS.some((re) => re.test(line)) && /^[^:：]*[:：]\s*\d{4}-\d{2}-\d{2}\b/.test(line);
}

/** 行頭（インデント可）のフェンス記号。CommonMark はバッククォートかチルダ3個以上。 */
// 2つ目のグループは記号の**後ろに続く残り**。閉じ記号の判定に要る（下記）。
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

/**
 * コードフェンスの外側の行だけを `{ n, line }` で返す。閉じられていないフェンスが
 * 残った場合は `{ lines, unclosed }` の `unclosed` に開始行番号を入れて返す。
 *
 * フェンスの中には `# 2026-12-31 …` のようなシェルコメントが入りうる。
 * これを見出しとして扱うと、**正しい文書がこの検査に落とされる**。
 * pre-commit フックに入っているのでコミットが止まる。PR #1027 の `/code-review` 指摘。
 *
 * 開閉の対応は CommonMark に合わせる。単純なトグルだと2つの取り違えが起きる
 * （同じレビューの指摘）。
 *
 *   - **入れ子。** ```` で開いたブロックの中の ``` は閉じ記号ではないのに、
 *     トグルだと状態が反転し、**以降の見出しと本文が入れ替わって解釈される**。
 *   - **閉じ忘れ。** トグルだと以降の全行が黙って検査対象から外れる。
 *     0件チェックは他ファイルの日付で通ってしまうので、**検査が空振りしたことに
 *     気づけない**（型 A そのもの）。開いたままなら下で失敗させる。
 *
 * 抽出と突き合わせの両方がこの1つを使う。
 */
function contentLines(text) {
  const out = [];
  let open = null; // 開いているフェンスの記号（`` ```　`` 等）
  let openedAt = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE);
    if (m) {
      if (open === null) {
        open = m[1];
        openedAt = i + 1;
        continue;
      }
      // 閉じ記号は「開いたのと同じ文字」で「同じ長さ以上」、さらに
      // **後ろに情報文字列を持たない**（空白のみ）でなければならない。
      // 情報文字列を許すと、外側の ``` ブロックの中に例として書いた
      // ````js の行が外側を閉じてしまい、その後の見出しが日付検査に晒され、
      // 本物の閉じ記号が「閉じられていないフェンス」に見える。
      // つまり**正しい文書をコミット拒否する**（Codex レビュー指摘）。
      if (m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === "") {
        open = null;
        continue;
      }
      // 入れ子の短いフェンスは、ブロックの中身。素通りさせる（下で捨てられる）。
    }
    if (open === null) out.push({ n: i + 1, line: lines[i] });
  }
  return { lines: out, unclosed: open === null ? 0 : openedAt };
}

/** 閉じられていないコードフェンスの開始行番号。無ければ 0。 */
export function unclosedFenceLine(text) {
  return contentLines(text).unclosed;
}

/** 1ファイル分の本文から、構造化された日付を行番号つきで抜き出す。 */
export function extractStructuredDates(text) {
  const out = [];
  for (const { n, line } of contentLines(text).lines) {
    if (HEADING.test(line)) {
      for (const m of line.matchAll(DATE)) out.push({ line: n, date: m[0] });
      continue;
    }
    for (const re of FIELD_PATTERNS) {
      const m = line.match(re);
      if (m) {
        out.push({ line: n, date: m[1] });
        break;
      }
    }
  }
  return out;
}

/** `today` から見て許容範囲を超えて未来の日付か。どちらも `YYYY-MM-DD`。 */
export function isTooFarInFuture(date, today, toleranceDays = TOLERANCE_DAYS) {
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + toleranceDays);
  return date > limit.toISOString().slice(0, 10);
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const files = readdirSync(CONTEXT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const bad = [];
  const missed = [];
  const unclosed = [];
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(join(CONTEXT_DIR, f), "utf8");
    const openedAt = unclosedFenceLine(text);
    if (openedAt) unclosed.push(`docs/context/${f}:${openedAt}`);
    const found = extractStructuredDates(text);
    for (const { line, date } of found) {
      checked++;
      if (isTooFarInFuture(date, today)) bad.push(`docs/context/${f}:${line}  ${date}`);
    }

    // **抽出器を、別実装の当たり判定と突き合わせる。**
    // 「日付を書く場所（見出し・日付フィールド）で、日付が実際に書かれているのに
    // 1件も抽出できていない行」は、抽出器の穴。0件チェックだけでは
    // 「923件中3件だけ取りこぼした」が見えない（実際に取りこぼしていた）。
    const gotLines = new Set(found.map((d) => d.line));
    for (const { n, line } of contentLines(text).lines) {
      if (!isStructuredLine(line) || !/\d{4}-\d{2}-\d{2}/.test(line)) continue;
      if (!gotLines.has(n)) missed.push(`docs/context/${f}:${n}  ${line.slice(0, 100)}`);
    }
  }

  // 閉じ忘れたフェンスは、そこから下を丸ごと検査対象から外す。0件チェックは
  // 他ファイルの日付で通ってしまうので、これは別に失敗させる（型 A）。
  if (unclosed.length) {
    console.error(`[check:context-dates] 閉じられていないコードフェンスが ${unclosed.length} 件あります:\n`);
    for (const u of unclosed) console.error(`  ${u}`);
    console.error("\n  ここから下の行が検査されません。フェンスを閉じてください。");
    process.exit(1);
  }

  // 検査が空振りしていないことを確かめる。パターンが実際の書き方に追いつけなく
  // なると0件になり、この検査は永久に緑のままになる（型 A）。
  if (checked === 0) {
    console.error("[check:context-dates] 構造化された日付を1件も見つけられませんでした。");
    console.error("  見出しの書き方が変わった可能性があります。抽出器を確認してください。");
    process.exit(1);
  }

  if (missed.length) {
    console.error(`[check:context-dates] 抽出器が取りこぼしている行が ${missed.length} 件あります:\n`);
    for (const m of missed) console.error(`  ${m}`);
    console.error("\n  日付が書かれているのに検査対象になっていません。抽出器を直してください。");
    process.exit(1);
  }

  if (bad.length) {
    console.error(`[check:context-dates] 今日（${today} UTC）より先の日付が ${bad.length} 件あります:\n`);
    for (const b of bad) console.error(`  ${b}`);
    console.error("\n  事業ログの日付は、書く前に `date -u` を打って確かめてください（CLAUDE.md / M-011）。");
    console.error("  過去の日付での遡及追記は許容されます。落ちているのは未来日だけです。");
    process.exit(1);
  }

  console.log(`[check:context-dates] OK — ${files.length} ファイル / ${checked} 件の日付を検査しました。`);
}

// テストから import されたときは main を走らせない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
