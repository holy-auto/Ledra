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

/**
 * 「そのエントリ自身が主張する日付」として扱う書き方。
 * 本文中の言及（「2日先の 2026-09-05 を書いた」等）を拾わないよう、
 * 行頭にアンカーする。
 */
const PATTERNS = [
  // DECISION_LOG / MISTAKE_LEDGER / RELEASE_LOG: `## 2026-09-04 タイトル`
  /^#{2,3} (\d{4}-\d{2}-\d{2})\b/,
  // OPEN_QUESTIONS / MISTAKE_LEDGER: `## タイトル（2026-09-04）` `## タイトル（2026-09-04・型 B）`
  /^#{2,3} .*（(\d{4}-\d{2}-\d{2})[^）]*）/,
  // DECISION_LOG の9項目: `1. 日付: 2026-09-04`
  /^1\. 日付: (\d{4}-\d{2}-\d{2})\b/,
  // OPEN_QUESTIONS: `- 起票日: 2026-09-04`
  /^- 起票日: (\d{4}-\d{2}-\d{2})\b/,
];

/**
 * 1ファイル分の本文から、構造化された日付を行番号つきで抜き出す。
 *
 * 1行が複数のパターンに当たることがある（`## タイトル（2026-09-04・型 B）` は
 * 2番目にだけ当たるが、書き方が増えたときに重複しうる）ので、行ごとに
 * **最初に当たった1つ**だけを採る。同じ行から同じ日付を2回報告しても意味がない。
 */
export function extractStructuredDates(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of PATTERNS) {
      const m = lines[i].match(re);
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
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(join(CONTEXT_DIR, f), "utf8");
    for (const { line, date } of extractStructuredDates(text)) {
      checked++;
      if (isTooFarInFuture(date, today)) bad.push(`docs/context/${f}:${line}  ${date}`);
    }
  }

  // 検査が空振りしていないことを確かめる。パターンが実際の書き方に追いつけなく
  // なると0件になり、この検査は永久に緑のままになる（型 A）。
  if (checked === 0) {
    console.error("[check:context-dates] 構造化された日付を1件も見つけられませんでした。");
    console.error("  見出しの書き方が変わった可能性があります。PATTERNS を確認してください。");
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
