#!/usr/bin/env node
/**
 * MISTAKE_LEDGER の見出し ID が一意かを検査する。
 *
 * 実行: node scripts/check-ledger-ids.mjs   （npm run check:ledger-ids）
 *
 * ## なぜ要るか（DECISION_LOG 2026-09-15）
 *
 * 連番 ID は並行セッションが「次の空き番号」という**共有された可変状態**を取り合うため
 * 衝突し続けた。改番で直そうとして**4回とも失敗**している（改番が次の衝突を生む／
 * 参照の一括置換が経過説明の表と他人の参照を壊す）。決定的なのは、
 * **4回目は「一括置換は危険」と自分で書いた注意書きを読んだうえで同じ操作を実行した**こと。
 * **手順書に書く方式は、この失敗に効かなかった。** 効くのは、衝突した状態を
 * マージさせないことだけである。
 *
 * ID は `M-<YYYYMMDD>-<スラッグ>`。日付＋スラッグには共有状態が無いので、
 * 同じ日に同じ表現を選ばない限り衝突しない。選んでも中身が違うのでマージ時に気づく。
 *
 * 旧番号（`旧 M-NNN`）は既存の参照 440 箇所を書き換えずに済ませるため見出しに残してあり、
 * **10組が重複したままである**。これは既知で、台帳冒頭の「ID について」節の表で引ける。
 * ここで見るのは新 ID の一意性だけ。旧番号の重複は「余剰の数」で見て、増えたら落とす。
 *
 * ## コードフェンスの中は見ない
 *
 * 台帳は**自分の書式を自分の中で説明する**文書なので、`## M-…` の例がフェンスの中に
 * 書かれうる。生のテキストを走査すると、その例を実在の見出しとして読んで落ちる。
 * この検査は pre-commit フックに入っているので、**正しい文書がリポジトリ全体の
 * コミットを止める**（`check-context-dates.mjs` が PR #1027 の指摘で通った道）。
 * フェンスの歩き方はそこに実装があるので、`contentLines` を import して使い回す。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { contentLines } from "./check-context-dates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "docs/context/MISTAKE_LEDGER.md");

/**
 * 旧番号の「余剰」の既知値。`旧 M-060` が2回出るなら余剰1。10組がそれぞれ2回なので 10。
 *
 * **組数ではなく余剰で見る。** 組数で見ると、既に重複している番号の3件目を足しても
 * 組数が変わらないので通ってしまう —— **いちばん間違えやすい10個だけが素通りする**
 * （PR #1089 の `/code-review` 指摘）。
 *
 * ponytail: 上限。手で持っている定数なので、10組の参照を新 ID へ移し終えたら
 * ここを下げる必要がある（下げ忘れても検査は成立し、緩いまま残るだけ）。
 */
export const KNOWN_LEGACY_EXCESS = 10;

/**
 * エントリ数の下限。**増える一方なので、下回ったら書式が壊れたか消えたかである。**
 * 0件チェックだけでは「102件中3件が書式から外れた」が見えない
 * （check-context-dates.mjs が同じ穴で実際に3件取りこぼしていた）。
 *
 * ponytail: 上限。手で維持する床なので、**台帳が伸びるほど相対的に緩くなる**
 * （200件のときに97件消えても落ちない）。上げるのは任意で、下限を割らない限り
 * 検査は成立する。厳密にやるならベース revision から
 * `git show origin/main:docs/context/MISTAKE_LEDGER.md | grep -c '^## M-'` で引くが、
 * pre-commit フックは shallow clone や detached HEAD でも動く必要があるので採らない。
 */
export const MIN_ENTRIES = 103;

/** 正準の見出し。`## M-<YYYYMMDD>-<スラッグ> 表題（…）` */
const ID_RE = /^## (M-(\d{4})(\d{2})(\d{2})-[a-z0-9-]+) \S/;
/** `## M-` で始まる見出しは全部この網に入れる。書式から外れたものを黙って見逃さないため。 */
const ANY_ENTRY_RE = /^## M-/;
/**
 * 旧番号の別名。`・旧 M-NNN` に続くのは `）`（末尾）か `・`（後ろに項目が続く）。
 * **行末にアンカーしない。** アンカーすると `（…・旧 M-070・型 A）` のように
 * 項目の順が違うだけで別名が見えなくなり、そこで作られた重複を検出できない
 * （PR #1089 の `/code-review` 指摘）。書式は項目の順を決めていない。
 */
const LEGACY_RE = /・旧 (M-\d+)(?=[・）])/g;

/**
 * 台帳の本文を検査する。問題があれば人が読めるメッセージを `error` に入れて返す。
 *
 * **落とす条件を5つに分けてあるのは、どれか1つが空振りしても他が生きるようにするため。**
 * 「重複が無い」だけを見ると、見出しの書式が変わって0件になった日から
 * この検査は永久に緑になる（型 A）。
 */
export function checkLedger(text, { knownLegacyExcess = KNOWN_LEGACY_EXCESS, minEntries = MIN_ENTRIES } = {}) {
  const headings = contentLines(text).lines.map(({ line }) => line).filter((l) => ANY_ENTRY_RE.test(l));

  // 1. 書式から外れた見出し。旧形式 (`## M-060 …`) も、スラッグの大文字混入も、
  //    表題の付け忘れも、まとめてここに落ちる。**分類できないものを通さない。**
  const malformed = headings.filter((h) => !ID_RE.test(h));
  if (malformed.length > 0) {
    return {
      ok: false,
      error:
        `ID の書式から外れた見出しが ${malformed.length} 件ある` +
        "（正準形は `## M-<YYYYMMDD>-<スラッグ> 表題（…）`、スラッグは英小文字・数字・ハイフン）:\n" +
        malformed.slice(0, 10).map((h) => `    ${h.slice(0, 100)}`).join("\n"),
    };
  }

  const parsed = headings.map((h) => ({ heading: h, m: h.match(ID_RE) }));
  const ids = parsed.map(({ m }) => m[1]);

  // 2. ID に埋めた日付と、見出しが名乗る日付の一致。
  //    **ID 化で日付検査に穴が空いた。** `check:context-dates` の日付正規表現は
  //    `YYYY-MM-DD` なので、ID の `YYYYMMDD` は見えない。ここで突き合わせないと
  //    `M-20270101-…（2026-09-15・型 A）` のような未来日の ID が誰にも見られない。
  const dateMismatch = parsed
    .filter(({ heading, m }) => !heading.includes(`${m[2]}-${m[3]}-${m[4]}`))
    .map(({ heading, m }) => `    ${m[1]} は ${m[2]}-${m[3]}-${m[4]} を名乗るが見出しに無い: ${heading.slice(0, 90)}`);
  if (dateMismatch.length > 0) {
    return {
      ok: false,
      error:
        `ID の日付と見出しの日付が一致しない見出しが ${dateMismatch.length} 件ある:\n` +
        dateMismatch.slice(0, 10).join("\n") +
        "\n  → ID の日付はそのエントリの日付である。書く前に `date -u` を打つこと（M-011）。",
    };
  }

  // 3. 件数の下限割れ。書式が変わって読めなくなった／エントリが消えた。
  if (ids.length < minEntries) {
    return {
      ok: false,
      error:
        `エントリが ${ids.length} 件しか読めなかった（下限は ${minEntries} 件）。\n` +
        "  見出しの書式が変わったか、エントリが消えている。",
    };
  }

  // 4. 新 ID の重複。これが本来の目的。
  const seen = new Set();
  const dupes = new Set();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  if (dupes.size > 0) {
    return {
      ok: false,
      error:
        `ID が重複している: ${[...dupes].join(", ")}\n` +
        "  → 同じ日に同じスラッグを選んでいる。どちらかのスラッグを、中身を表す別の語に変えること。",
    };
  }

  // 5. 旧番号の余剰が増えていないか（新しい重複を持ち込ませない）。
  const legacySeen = new Map();
  for (const h of headings) {
    for (const m of h.matchAll(LEGACY_RE)) legacySeen.set(m[1], (legacySeen.get(m[1]) ?? 0) + 1);
  }
  const legacyDupes = [...legacySeen.entries()].filter(([, n]) => n > 1);
  const excess = legacyDupes.reduce((s, [, n]) => s + n - 1, 0);
  if (excess > knownLegacyExcess) {
    return {
      ok: false,
      error:
        `旧番号の余剰が ${excess} に増えた（既知は ${knownLegacyExcess}）:\n` +
        `    ${legacyDupes.map(([n, c]) => `${n}×${c}`).join(", ")}\n` +
        "  → 新しいエントリに旧番号を付けないこと。旧番号は移行時の別名で、新規には要らない。",
    };
  }

  return { ok: true, error: null, ids, legacyDupes: legacyDupes.map(([n]) => n), legacyExcess: excess };
}

function main() {
  const result = checkLedger(readFileSync(LEDGER, "utf8"));
  if (!result.ok) {
    console.error(`check-ledger-ids: NG\n  ${result.error}`);
    process.exit(1);
  }
  console.log(
    `check-ledger-ids: OK（ID ${result.ids.length} 件すべて一意 / 旧番号の既知重複 ${result.legacyDupes.length} 組・余剰 ${result.legacyExcess}）`,
  );
}

// テストから import されたときは main を走らせない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
