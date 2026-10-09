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
 * 旧番号（`旧 M-NNN`）は既存の参照 450 箇所を書き換えずに済ませるため見出しに残してあり、
 * **10組が重複したままである**。これは既知で、台帳冒頭の「ID について」節の表で引ける。
 * ここで見るのは新 ID の一意性だけ。旧番号の重複は「余剰の数」で見て、増えたら落とす。
 *
 * ## 型表の行も見る（2026-10-09 追加）
 *
 * 冒頭の「失敗の型」の表は、マージの衝突で**行が2本になる**ことがある。
 * `docs/context/*.md` は追記型ログなので衝突は「両側を残す」で解けるが、
 * それは**エントリには正しく、表の行には誤り**である（2026-10-07 に実際に壊した:
 * `M-20261007-merge-duplicated-the-ledger-type-row-and-i-verified-the-wrong-thing`）。
 * そのとき「grep で1本かを確かめる」習慣を決めたが、**2026-10-09 の4回のマージで
 * 4回とも手で打つ必要があった。** 習慣で持つものではないので検査に入れた。
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
export const MIN_ENTRIES = 105;

/**
 * 失敗の「型」の表の行数の下限。**今は A〜L の12型**。
 *
 * 型が増えることはあっても減らないので、下回ったら**表の書式が変わって読めなくなった**か
 * 行が消えたかである。0件チェックだけでは「12行のうち9行しか読めていない」が見えない
 * （上の MIN_ENTRIES と同じ理由）。
 *
 * ponytail: 手で持っている床なので、型を増やしたら上げてよい（上げ忘れても検査は成立し、
 * 緩いまま残るだけ）。範囲を `[A-Z]` にしてあるのは、`[A-I]` と書いて J/K/L を
 * 見逃す範囲にした前例があるため（MISTAKE_LEDGER の 2026-10-08 訂正）。
 */
export const MIN_TYPE_ROWS = 12;

/** 正準の見出し。`## M-<YYYYMMDD>-<スラッグ> 表題（…）` */
const ID_RE = /^## (M-(\d{4})(\d{2})(\d{2})-[a-z0-9-]+) \S/;
/** `## M-` で始まる見出しは全部この網に入れる。書式から外れたものを黙って見逃さないため。 */
const ANY_ENTRY_RE = /^## M-/;
/**
 * 失敗の「型」の表の行。`| **A. 道具を検証しない** | 中身… | 該当 ID… |`
 *
 * **行頭にアンカーする。** 本文中に `| **A.` を含む行（表の引用など）を拾わないため。
 */
const TYPE_ROW_RE = /^\| \*\*([A-Z])\. /;
/** 表のセルに書かれた新形式 ID。旧番号（`M-005` 等）は実在のエントリではないので対象外。 */
const TABLE_ID_RE = /M-\d{8}-[a-z0-9-]+/g;
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
export function checkLedger(
  text,
  { knownLegacyExcess = KNOWN_LEGACY_EXCESS, minEntries = MIN_ENTRIES, minTypeRows = MIN_TYPE_ROWS } = {},
) {
  const bodyLines = contentLines(text).lines.map(({ line }) => line);
  const headings = bodyLines.filter((l) => ANY_ENTRY_RE.test(l));
  const typeRows = bodyLines.filter((l) => TYPE_ROW_RE.test(l));

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

  // 6. **型表の行が型ごとに1本か。** ここが本題。
  //    `docs/context/*.md` は追記型ログなので、衝突は「両側を残す」で解ける —— **エントリは**。
  //    型表の行は両側に同じ行があるので、同じ解き方をすると**行が2本になる**。
  //    2026-10-07 に実際にそれで壊し、ID 一覧が食い違った状態をマージした
  //    （`M-20261007-merge-duplicated-the-ledger-type-row-and-i-verified-the-wrong-thing`）。
  //    そのとき決めた習慣（`grep -oE '^\| \*\*[A-Z]\.' | sort | uniq -c`）は、
  //    **2026-10-09 の4回のマージで4回とも手で打つ必要があった。** 習慣ではなく検査にする。
  if (typeRows.length < minTypeRows) {
    return {
      ok: false,
      error:
        `型表の行が ${typeRows.length} 行しか読めなかった（下限は ${minTypeRows} 行）。\n` +
        "  表の書式が変わったか、行が消えている。行は `| **A. 型の名前** | 中身 | 該当 ID |`。",
    };
  }
  const rowSeen = new Map();
  for (const row of typeRows) {
    const letter = row.match(TYPE_ROW_RE)[1];
    rowSeen.set(letter, (rowSeen.get(letter) ?? 0) + 1);
  }
  const rowDupes = [...rowSeen.entries()].filter(([, n]) => n > 1);
  if (rowDupes.length > 0) {
    return {
      ok: false,
      error:
        `型表の行が重複している: ${rowDupes.map(([l, n]) => `${l} 行×${n}`).join(", ")}\n` +
        "  → マージの衝突を「両側を残す」で解いたときに起きる。**エントリには正しく、表の行には誤り。**\n" +
        "  2本の行は ID 一覧が食い違っているので、**和集合にして1本へ戻すこと**\n" +
        "  （説明文が一致していることを確かめてから、ID を結合する）。",
    };
  }

  // 7. **表に載っている新形式 ID が、実在のエントリか。**
  //    行を和集合にするときの打ち間違い・エントリの改名で、表が死んだ ID を指すようになる。
  //    表は「この型は過去にどれだったか」を引くための索引なので、指し先が無いと索引が壊れる。
  //    旧番号（`M-005` 等）は新形式の見出しとして実在しないので対象外。
  const entryIds = new Set(ids);
  const dangling = new Set();
  for (const row of typeRows) {
    for (const m of row.matchAll(TABLE_ID_RE)) if (!entryIds.has(m[0])) dangling.add(m[0]);
  }
  if (dangling.size > 0) {
    return {
      ok: false,
      error:
        `型表が実在しない ID を指している（${dangling.size} 件）: ${[...dangling].slice(0, 5).join(", ")}\n` +
        "  → 表の ID の打ち間違いか、エントリを改名して表を直していない。\n" +
        "  表は「この型は過去にどれだったか」を引く索引なので、指し先が無いと引けない。",
    };
  }

  return {
    ok: true,
    error: null,
    ids,
    legacyDupes: legacyDupes.map(([n]) => n),
    legacyExcess: excess,
    typeRows: typeRows.length,
  };
}

function main() {
  const result = checkLedger(readFileSync(LEDGER, "utf8"));
  if (!result.ok) {
    console.error(`check-ledger-ids: NG\n  ${result.error}`);
    process.exit(1);
  }
  console.log(
    `check-ledger-ids: OK（ID ${result.ids.length} 件すべて一意 / 旧番号の既知重複 ${result.legacyDupes.length} 組・余剰 ${result.legacyExcess} / 型表 ${result.typeRows} 行が型ごとに1本）`,
  );
}

// テストから import されたときは main を走らせない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
