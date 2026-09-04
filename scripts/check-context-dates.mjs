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
  /^1\. 日付: (\d{4}-\d{2}-\d{2})\b/,
  // OPEN_QUESTIONS: `- 起票日: 2026-09-04`
  /^- 起票日: (\d{4}-\d{2}-\d{2})\b/,
];

/** その行が「日付を書く場所」か（下の突き合わせ用の、抽出とは別実装の判定）。 */
export function isStructuredLine(line) {
  return line.startsWith("#") || line.startsWith("1. 日付:") || line.startsWith("- 起票日:");
}

/** 1ファイル分の本文から、構造化された日付を行番号つきで抜き出す。 */
export function extractStructuredDates(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HEADING.test(line)) {
      for (const m of line.matchAll(DATE)) out.push({ line: i + 1, date: m[0] });
      continue;
    }
    for (const re of FIELD_PATTERNS) {
      const m = line.match(re);
      if (m) {
        out.push({ line: i + 1, date: m[1] });
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
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(join(CONTEXT_DIR, f), "utf8");
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
    text.split("\n").forEach((line, i) => {
      if (!isStructuredLine(line) || !/\d{4}-\d{2}-\d{2}/.test(line)) return;
      if (!gotLines.has(i + 1)) missed.push(`docs/context/${f}:${i + 1}  ${line.slice(0, 100)}`);
    });
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
