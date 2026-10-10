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
import { readFileSync, writeFileSync } from "node:fs";
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

/** 同じ数え方を3度書かないための小物（検査5・6で使う）。 */
const countBy = (xs, key) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());

/**
 * 型表の本体の行だけを返す。ヘッダ行 → 区切り行 → 本体 → 空行、という形を前提にする。
 * ヘッダが見つからなければ空配列（検査6-b の床が落とす）。
 *
 * 受け取るのは `contentLines()` の要素（`{ n, line }`）で、**元の行番号を付けたまま返す。**
 * `fixLedger` が「表のブロックの行だけ」を書き換えるのにその番号が要る ——
 * 生の全行から `TYPE_ROW_RE` で拾うと、**フェンス外で表の行を引用した本文**まで
 * 書き換えてしまう（検査側は #1289 の `/code-review` で同じ穴を塞いである）。
 * 走査を2箇所に書かないために、ここを両方で使う。
 */
function typeTableRows(entries) {
  // **本文でヘッダを引用されても0行にしない。** `startsWith` で最初の一致を採ると、
  // 表の上の本文に `| 型 | 中身 | 該当 |` と書いた日から**正しい文書が0行**になり、
  // 行数の床（検査6-b）が落ちて pre-commit がリポジトリ全体を止める（/code-review 指摘・
  // 実測）。行の引用に対しては同じ穴を塞いであったのに、**ヘッダの引用を見ていなかった。**
  // 候補を全部試して、**行が1本でも取れたブロック**を採る。
  for (let h = 0; h < entries.length; h++) {
    if (!entries[h].line.startsWith(TYPE_TABLE_HEADER)) continue;
    const rows = [];
    for (const e of entries.slice(h + 2)) {
      if (e.line.trim() === "") break;
      rows.push(e);
    }
    const found = rows.filter(({ line }) => TYPE_ROW_RE.test(line));
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * 表の行から「該当」列（ID の並ぶ最後のセル）を返す。読めなければ `null`。
 *
 * **列番号を決め打ちしない。** `split("|")[3]` だと、中身のセルに `|` が1つ
 * 入っただけで列がずれ、その型の全エントリが「未掲載」になる —— しかも
 * `--fix` は直せない（/code-review 指摘・実測）。さらに末尾のパイプが落ちた行では
 * `undefined.matchAll` で**落ちる**（pre-commit がスタックトレースで死ぬ）。
 * 両方とも「最後の内側セル」を取れば消える。
 */
function targetCell(line) {
  // 正しい行は内側3セル（型の名前・中身・該当）。中身にパイプが入れば4以上になり、
  // **最後の内側セルが該当列**であることは変わらない。2以下は列が落ちている
  // （`>= 2` にしていたら、末尾のパイプが落ちた行で**中身のセルを該当列と誤読**し、
  // その型の全エントリを未掲載と言い出す。実測で素通りした）。
  const inner = line.split("|").slice(1, -1);
  return inner.length >= 3 ? inner.at(-1) : null;
}

/**
 * 「見出しが名乗った型」と「その型の行」の組のうち、**行に載っていないもの**を返す。
 *
 * **検査8と `fixLedger` が同じ計算を2度書いていた。** 片方は列を決め打ちして
 * ガード無し、もう片方は `parts.length !== 5` で弾く、という違いがそのまま
 * 「赤いのに直せない」「片方だけ落ちる」の原因だった（/code-review 指摘）。
 * **同じ事実は1箇所で数える。** 同じ型を2度名乗った見出し（`型 A／A`）で
 * 二重に数えないよう、組は重複を排除する。
 */
function missingPairs(entries) {
  const rowCells = new Map();
  for (const { line } of typeTableRows(entries)) {
    const cell = targetCell(line);
    if (cell === null) continue; // 列が読めない行は検査6側の問題として扱う
    rowCells.set(line.match(TYPE_ROW_RE)[1], new Set([...cell.matchAll(TABLE_ID_LOOSE_RE)].map((m) => m[0])));
  }
  const seen = new Set();
  const out = [];
  for (const { line } of entries) {
    if (!ANY_ENTRY_RE.test(line)) continue;
    const m = line.match(ID_RE);
    const tail = line.match(HEADING_TAIL_RE);
    if (!m || !tail) continue;
    for (const [, token] of tail[1].matchAll(DECLARED_TYPE_RE)) {
      for (const type of splitTypes(token)) {
        const key = `${m[1]}\u0000${type}`;
        if (seen.has(key) || rowCells.get(type)?.has(m[1])) continue;
        seen.add(key);
        out.push({ id: m[1], type });
      }
    }
  }
  return out;
}

/** 正準の見出し。`## M-<YYYYMMDD>-<スラッグ> 表題（…）` */
const ID_RE = /^## (M-(\d{4})(\d{2})(\d{2})-[a-z0-9-]+) \S/;
/** `## M-` で始まる見出しは全部この網に入れる。書式から外れたものを黙って見逃さないため。 */
const ANY_ENTRY_RE = /^## M-/;
/**
 * 失敗の「型」の表の行。`| **A. 道具を検証しない** | 中身… | 該当 ID… |`
 *
 * **行頭アンカーだけでは足りない。** 台帳は自分の書式を自分の中で説明する文書なので、
 * **フェンスに入れずに表の行を引用した本文**も行頭から始まる。全文を走査すると、
 * その引用を2本目の行として数えて落ちる —— そして `check:ledger-ids` は pre-commit に
 * 入っているので、**正しい文書がリポジトリ全体のコミットを止める**（/code-review 指摘・
 * 2026-10-09。実測で `A 行×2` を出した）。逆向きも壊れる: 表に無い文字の引用
 * （`| **M. …`）が行数を13に増やし、**本当に消えた行を隠す**。
 * だから走査は**表のブロック1つに限る**（下の `typeTableRows()`）。
 */
const TYPE_ROW_RE = /^\| \*\*([A-Z])\. /;
/** 型表のヘッダ。この次の区切り行の後から、最初の空行までが表の本体。 */
const TYPE_TABLE_HEADER = "| 型 | 中身 | 該当 |";
/**
 * 表のセルに書かれた ID らしきもの。**緩く拾う。**
 *
 * 当初は `M-\d{8}-[a-z0-9-]+` に限っていたが、それでは
 * **打ち間違い（大文字混入・日付の桁落ち）が「一致しない」ので素通りする** ——
 * 検査7が止めるはずの誤りそのものを見逃していた（/code-review 指摘。
 * `M-20991231-Does-Not-Exist` と `M-2099123-does-not-exist` の両方で素通りを実測）。
 * 緩く拾って、**実在のエントリでも旧番号でもないもの**を落とす。
 */
const TABLE_ID_LOOSE_RE = /M-[0-9A-Za-z-]{3,}/g;
/** 旧番号（`M-060` 等）。移行時の別名で、新形式の見出しとしては実在しない。 */
const LEGACY_ID_RE = /^M-\d{1,4}$/;
/**
 * 見出しが名乗る型。`（2026-10-09・型 F）`／`（…・型 F／A）`／`（…・型 A、併せて型 C）`
 * のどれも拾う。**書式は型の書き方を1つに決めていない**ので、`型 X` の出現を全部取る。
 *
 * 末尾の括弧に限るのは、表題の中の「型 A」のような言及を型の宣言として読まないため。
 */
const HEADING_TAIL_RE = /（([^（）]*)）\s*$/;
/**
 * **`型 E／F` のように1つの「型」で2つ以上を名乗る形がある。**
 * 当初は `/型\s*([A-Z])/g` で「型」の直後の1文字だけを取っていて、
 * **2つ目を黙って落としていた**（実測10件がこの形。`型 A / C` もある）。
 * テストの「2つの型を名乗って両方に無いと2件」が1件しか出さずに露呈した。
 * 区切りは実測にあるものだけ（`／` と `/`）にする。`型 F・旧 M-090` の `・` は
 * 型の区切りではないので入れない。
 *
 * **前後をアンカーする。** していないと `新型 Bug を踏んだ` のような本文が
 * 「型 B の宣言」に見え、**満たしようのない組**を要求して pre-commit を止める
 * （/code-review 指摘・実測）。後ろは英字が続く形（`型 Bug`）を弾き、
 * 前は**漢字だけ**を弾く（`新型`・`典型`・`同型`）。
 *
 * **前のアンカーをかな・カナ・英字まで広げてはいけない。** 一度 `[一-龥ぁ-んァ-ンA-Za-z]`
 * で書いたら、**実際に使われている `型 E、併せて型 A` の2つ目が消えた**（`て` がかな）。
 * 全見出しで突き合わせて確認した: アンカー無しと「漢字のみ除外＋後ろ」はどちらも
 * **222 組で一致**し、かな・カナまで広げた版は **216 組**（実データを6件落とす）。
 * `admin:` が `super_admin:` に当たる話と同じで、**境界を締めるほど正しいわけではない**
 * （CLAUDE.md「判断の道具そのものを検証する」）。
 */
const DECLARED_TYPE_RE = /(?<![一-龥])型\s*([A-Z](?:\s*[／/]\s*[A-Z])*)(?![A-Za-z])/g;
/** 上で拾った `E／F` を型1つずつに割る。 */
const splitTypes = (token) => token.split(/[／/\s]+/).filter(Boolean);
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
 * **落とす条件を8つに分けてあるのは、どれか1つが空振りしても他が生きるようにするため。**
 * 「重複が無い」だけを見ると、見出しの書式が変わって0件になった日から
 * この検査は永久に緑になる（型 A）。
 * （1〜5 が見出しの ID、6-a/6-b/6-c/7/8 が表。2026-10-09 に 5 → 7、2026-10-10 に 8 に増えた。
 * 7 は「表 → エントリ」（指し先が実在するか）、8 は「エントリ → 表」（名乗った型の行に載っているか）。
 *
 * **対称にはしていない。** 表は見出しが名乗っていない型にもエントリを挙げてよい
 * （副次的な分類。実測で9組ある）。検査8が見るのは「**名乗った型は最低限載っている**」までで、
 * 「名乗っていない型に載っているのは誤り」とはしない —— それを検査にすると、
 * 分類の付け足しを消すことになる。載りすぎが古い分類の残骸か意図的な付け足しかは
 * OPEN_QUESTIONS に【未決】として置いてある。）
 */
export function checkLedger(
  text,
  { knownLegacyExcess = KNOWN_LEGACY_EXCESS, minEntries = MIN_ENTRIES, minTypeRows = MIN_TYPE_ROWS } = {},
) {
  const entries = contentLines(text).lines;
  const bodyLines = entries.map(({ line }) => line);
  const headings = bodyLines.filter((l) => ANY_ENTRY_RE.test(l));
  const typeRows = typeTableRows(entries).map(({ line }) => line);

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
  const legacyNames = headings.flatMap((h) => [...h.matchAll(LEGACY_RE)].map((m) => m[1]));
  const legacyDupes = [...countBy(legacyNames, (x) => x).entries()].filter(([, n]) => n > 1);
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
  const rowDupes = [...countBy(typeRows, (r) => r.match(TYPE_ROW_RE)[1]).entries()].filter(([, n]) => n > 1);
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

  // 6-c. **該当列が読めない行。** 末尾のパイプが落ちた行は `TYPE_ROW_RE` には当たるので
  //      6-a/6-b を通り抜け、以前は検査8で `undefined.matchAll` になって
  //      **pre-commit がスタックトレースで死んでいた**（/code-review 指摘・実測）。
  //      ここで名指しで落とす —— 「その型の全エントリが未掲載」と出るより、
  //      壊れている行を1本見せるほうが直せる。
  const unreadable = typeRows.filter((r) => targetCell(r) === null);
  if (unreadable.length > 0) {
    return {
      ok: false,
      error:
        `型表の行の「該当」列が読めない（${unreadable.length} 行）:\n` +
        unreadable.slice(0, 5).map((r) => `    ${r.slice(0, 90)}`).join("\n") +
        "\n  → 行は `| **A. 型の名前** | 中身 | 該当 ID… |` の3列。" +
        "末尾のパイプが落ちていないか見ること。",
    };
  }

  // 7. **表に載っている ID が、実在のエントリか旧番号か。**
  //    行を和集合にするときの打ち間違い・エントリの改名で、表が死んだ ID を指すようになる。
  //    表は「この型は過去にどれだったか」を引くための索引なので、指し先が無いと索引が壊れる。
  //
  //    **型表だけでなく、ファイル中のすべての表の行を見る。** 冒頭の
  //    「旧番号が重複していた10組」の表も同じ索引で、同じ壊れ方をする
  //    （打ち間違い・改名の置き忘れ）。範囲を型表に限る理由が無い（/code-review 指摘）。
  const entryIds = new Set(ids);
  const dangling = new Set();
  for (const line of bodyLines) {
    if (!line.startsWith("| ")) continue;
    for (const m of line.matchAll(TABLE_ID_LOOSE_RE)) {
      if (entryIds.has(m[0]) || LEGACY_ID_RE.test(m[0])) continue;
      dangling.add(m[0]);
    }
  }
  if (dangling.size > 0) {
    return {
      ok: false,
      error:
        `表が実在しない ID を指している（${dangling.size} 件）: ${[...dangling].slice(0, 5).join(", ")}\n` +
        "  → 表の ID の打ち間違いか、エントリを改名して表を直していない。\n" +
        "  表は「この型は過去にどれだったか」を引く索引なので、指し先が無いと引けない。\n" +
        "  正準形は `M-<YYYYMMDD>-<スラッグ>`（スラッグは英小文字・数字・ハイフン）、" +
        "旧番号は `M-NNN`。",
    };
  }

  // 8. **見出しが名乗る型の行に、その ID が載っているか（索引の逆向き）。**
  //    表の 該当 列は「この型は過去にどれだったか」を引くための索引である。
  //    検査7は「表 → エントリ」（死んだ ID を指していないか）だけを見ており、
  //    **「エントリ → 表」が抜けていた** —— 新しいエントリを足して表に足し忘れても緑だった。
  //    2026-10-10 に実測したら、型を名乗る 203 件のうち **60 件が名乗った行に無かった**
  //    （どの行にも無い）。索引が7割しか答えないのに、**欠けている印はどこにも出ない**
  //    （型 L: 既定を開いたまま守る）。60件を補完したうえでこの向きを足した。
  //
  //    旧番号だけを名乗る見出し（`（…・旧 M-076）`、45件）は型を宣言していないので対象外。
  //    全件が旧番号で表に載っていることは実測した。型を書けと強制はしない ——
  //    それは初日から45件赤になり、「正しい検査でも初日から赤なら入れない」に反する
  //    （DECISION_LOG 2026-10-09）。
  const unindexed = missingPairs(entries).map(({ id, type }) => `${id} → 型 ${type}`);
  if (unindexed.length > 0) {
    return {
      ok: false,
      // `--fix` が直せるのはこの1種類だけなので、呼び出し側が見分けられるようにする。
      kind: "unindexed",
      error:
        `見出しが名乗る型の行に載っていない組が ${unindexed.length} 件ある:\n` +
        unindexed.slice(0, 10).map((x) => `    ${x}`).join("\n") +
        "\n  → 表の 該当 列は「この型は過去にどれだったか」を引く索引なので、" +
        "**名乗った型の行に ID を足すこと**。\n" +
        "  `npm run check:ledger-ids -- --fix` が、旧番号の後・日付の昇順の位置へ入れる。\n" +
        "  型の分類を変えたときは見出しと表の両方を変える（--fix は足すだけで、消さない）。",
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

/**
 * 検査8の欠落を埋めた本文を返す（**足すだけ。消さない**）。
 *
 * **なぜ検査と同じファイルに置くか。** 台帳は1セッションに何度も追記する。
 * 2箇所を手で直す検査は、面倒になった時点で無効化されるか、赤を見慣れて終わる
 * （DECISION_LOG 2026-10-09）。補完は機械でできるので、検査と同じ所に置いて
 * エラーメッセージから指せるようにする。
 *
 * 入れる位置は既存の並びの規則に合わせる: **旧番号が先、その後は日付の昇順。**
 * 実測で12行すべてが「旧番号が日付 ID の後に混ざらない」形を守っている
 * （昇順の方は既存にも乱れがあるので、そこは直さない —— 並べ替えは
 * この検査の仕事ではないし、差分が大きくなる。実測は隣接の降順が8組／走る最大を
 * 下回る要素が15件で、**数え方で値が変わる**ので検査にもしていない）。
 *
 * ponytail: 天井。表のブロックが1つであることを前提にしている（検査6-a/6-b が
 * それを保証する）。行の書式が `| **X. 名前** | 中身 | ID… |` から変わったら、
 * ここも `TYPE_ROW_RE` と一緒に直す。
 */
export function fixLedger(text) {
  const lines = text.split("\n");
  const entries = contentLines(text).lines;
  const rows = typeTableRows(entries);
  const want = new Map(); // 型 → 足す ID（日付順）
  for (const { id, type } of missingPairs(entries)) {
    want.set(type, [...(want.get(type) ?? []), id]);
  }
  for (const list of want.values()) list.sort();
  const added = [];
  // **表のブロックの行だけを書き換える。** 生の全行を `TYPE_ROW_RE` で拾うと、
  // フェンス外で表の行を引用した本文まで書き換わる（台帳は自分の書式を自分の中で
  // 説明する文書なので、その引用は正当な書き方である）。
  for (const { n } of rows) {
    const i = n - 1;
    const t = lines[i].match(TYPE_ROW_RE)?.[1];
    if (!t || !want.has(t)) continue;
    const parts = lines[i].split("|");
    if (parts.length !== 5) continue;
    const items = parts[3].split(",").map((x) => x.trim()).filter(Boolean);
    for (const id of want.get(t)) {
      const date = id.slice(2, 10);
      const at = items.findIndex((it) => {
        const d = it.replace(/\*/g, "").match(/^M-(\d{8})-/);
        return d !== null && d[1] > date;
      });
      items.splice(at < 0 ? items.length : at, 0, `**${id}**`);
      added.push(`${id} → 型 ${t}`);
    }
    parts[3] = ` ${items.join(", ")} `;
    lines[i] = parts.join("|");
  }
  return { text: lines.join("\n"), added };
}

function main() {
  if (process.argv.includes("--fix")) {
    // **直す前に検査する。** 表の行が2本になっている状態で補完すると、
    // 同じ ID を両方の行に入れて**検査6-a が止めるはずの壊れを深くする**
    // （/code-review 指摘・実測。2026-10-07 に実際に起きた形がまさにこれ）。
    // `--fix` が直せるのは検査8の欠落だけなので、それ以外の赤では何も書かない。
    const text = readFileSync(LEDGER, "utf8");
    const before = checkLedger(text);
    if (before.ok) {
      console.log("check-ledger-ids --fix: 足すものは無い（索引は埋まっている）");
    } else if (before.kind !== "unindexed") {
      console.error(
        `check-ledger-ids --fix: 先に直すものがあるので何も書かなかった\n  ${before.error}`,
      );
      process.exit(1);
    } else {
      const { text: fixed, added } = fixLedger(text);
      if (added.length === 0) {
        // 欠落はあるのに1件も置けなかった = 置き先の行が無い（型の誤記など）。
        // ここで「埋まっている」と言うと、次の行の赤と矛盾する（/code-review 指摘）。
        console.error(
          `check-ledger-ids --fix: 置き先の行が無いので置けなかった\n  ${before.error}`,
        );
        process.exit(1);
      }
      writeFileSync(LEDGER, fixed);
      console.log(`check-ledger-ids --fix: 型表に ${added.length} 件足した:\n  ${added.join("\n  ")}`);
    }
  }
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
