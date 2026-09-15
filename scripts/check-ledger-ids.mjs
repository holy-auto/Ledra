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
 * 旧番号（`旧 M-NNN`）は既存の参照 438 箇所を書き換えずに済ませるため見出しに残してあり、
 * **10組が重複したままである**。これは既知で、台帳冒頭の「ID について」節の表で引ける。
 * ここで見るのは新 ID の一意性だけ。旧番号の重複は数だけ確認し、増えたら落とす。
 *
 * ponytail: 上限。旧番号の既知重複は定数 `KNOWN_LEGACY_DUPES` に焼いてある。
 * 10組の参照を新 ID へ移し終えたらこの定数を下げる（下げても検査は成立する）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "docs/context/MISTAKE_LEDGER.md");

/** 既知の旧番号重複。ID 方式を変えた 2026-09-15 時点の実測値。超えたら新しい重複である。 */
export const KNOWN_LEGACY_DUPES = 10;

/**
 * エントリ数の下限。**増える一方なので、下回ったら書式が壊れたか消えたかである。**
 * 0件チェックだけでは「102件中3件が書式から外れた」が見えない
 * （check-context-dates.mjs が同じ穴で実際に3件取りこぼしていた）。
 */
export const MIN_ENTRIES = 102;

/** 正準の見出し。`## M-<YYYYMMDD>-<スラッグ> 表題（…）` */
const ID_RE = /^## (M-\d{8}-[a-z0-9-]+) \S/;
/** `## M-` で始まる見出しは全部この網に入れる。書式から外れたものを黙って見逃さないため。 */
const ANY_ENTRY_RE = /^## M-.*$/gm;
/** 旧番号の別名。`…・旧 M-NNN）` の形で見出し末尾に残っている。 */
const LEGACY_RE = /・旧 (M-\d+)）\s*$/;

/**
 * 台帳の本文を検査する。問題があれば人が読めるメッセージを `error` に入れて返す。
 *
 * **落とす条件を4つに分けてあるのは、どれか1つが空振りしても他が生きるようにするため。**
 * 「重複が無い」だけを見ると、見出しの書式が変わって0件になった日から
 * この検査は永久に緑になる（型 A）。
 */
export function checkLedger(text, { knownLegacyDupes = KNOWN_LEGACY_DUPES, minEntries = MIN_ENTRIES } = {}) {
  const headings = [...text.matchAll(ANY_ENTRY_RE)].map((m) => m[0]);

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

  const ids = headings.map((h) => h.match(ID_RE)[1]);

  // 2. 件数の下限割れ。書式が変わって読めなくなった／エントリが消えた。
  if (ids.length < minEntries) {
    return {
      ok: false,
      error:
        `エントリが ${ids.length} 件しか読めなかった（下限は ${minEntries} 件）。\n` +
        "  見出しの書式が変わったか、エントリが消えている。",
    };
  }

  // 3. 新 ID の重複。これが本来の目的。
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

  // 4. 旧番号の重複が増えていないか（新しい重複を持ち込ませない）。
  const legacySeen = new Map();
  for (const h of headings) {
    const m = h.match(LEGACY_RE);
    if (m) legacySeen.set(m[1], (legacySeen.get(m[1]) ?? 0) + 1);
  }
  const legacyDupes = [...legacySeen.entries()].filter(([, n]) => n > 1);
  if (legacyDupes.length > knownLegacyDupes) {
    return {
      ok: false,
      error:
        `旧番号の重複が ${legacyDupes.length} 組に増えた（既知は ${knownLegacyDupes} 組）:\n` +
        `    ${legacyDupes.map(([n, c]) => `${n}×${c}`).join(", ")}\n` +
        "  → 新しいエントリに旧番号を付けないこと。旧番号は移行時の別名で、新規には要らない。",
    };
  }

  return { ok: true, error: null, ids, legacyDupes: legacyDupes.map(([n]) => n) };
}

function main() {
  const result = checkLedger(readFileSync(LEDGER, "utf8"));
  if (!result.ok) {
    console.error(`check-ledger-ids: NG\n  ${result.error}`);
    process.exit(1);
  }
  console.log(
    `check-ledger-ids: OK（ID ${result.ids.length} 件すべて一意 / 旧番号の既知重複 ${result.legacyDupes.length} 組）`,
  );
}

// テストから import されたときは main を走らせない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
