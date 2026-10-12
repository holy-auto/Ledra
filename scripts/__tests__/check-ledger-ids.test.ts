/**
 * `scripts/check-ledger-ids.mjs` のテスト。
 *
 * なぜ要るか: **陽性対照だけ置いて陰性対照を置かない**のがこの台帳の型 A の典型で、
 * 実際にそれをやっている（MISTAKE_LEDGER `M-20260907-no-negative-control`）。
 * 「無傷の台帳で OK が出る」は、検査が何も見ていなくても成立する。
 * ここでは**実物の MISTAKE_LEDGER.md に1箇所ずつ壊れを入れて、壊れごとに落ちること**を
 * 固定する。実物を使うのは、合成テキストだと「実際の見出しの書き方」から離れた瞬間に
 * 検査が空振りしていても気づけないため。
 *
 * **誤検出（正しい文書が落ちる）の対照も要る。** この検査は pre-commit フックに入って
 * いるので、誤検出はリポジトリ全体のコミットを止める。PR #1089 の `/code-review` で
 * 実際に見つかった形（フェンスの中の書式例）を陽性対照に入れてある。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @ts-expect-error -- .mjs に型定義は無い。検査対象は実行時の挙動。
import {
  checkLedger,
  fixLedger,
  KNOWN_LEGACY_EXCESS,
  MIN_ENTRIES,
  MIN_LEGACY_ROWS,
  MIN_TYPE_ROWS,
  MIN_TYPED_HEADINGS,
} from "../check-ledger-ids.mjs";

const LEDGER = join(dirname(fileURLToPath(import.meta.url)), "../../docs/context/MISTAKE_LEDGER.md");
const real: string = readFileSync(LEDGER, "utf8");

/** 実物の見出しのうち n 番目（0 始まり）を書き換える。 */
function mutateHeading(text: string, n: number, fn: (h: string) => string): string {
  const lines = text.split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^## M-/.test(lines[i])) continue;
    if (seen++ === n) {
      lines[i] = fn(lines[i]);
      return lines.join("\n");
    }
  }
  throw new Error(`見出しが ${n + 1} 件に満たない`);
}

/** 末尾にエントリを1件足す。 */
const withEntry = (heading: string) => `${real}\n${heading}\n\n本文。\n`;

/**
 * 末尾にエントリを1件足し、**その ID を型表の該当行にも入れる**（検査8を満たす形）。
 * 行への挿入は `fixLedger` を使わず手で書く —— 検査の陽性対照が補完器に依存すると、
 * 補完器が壊れたときに「検査が壊れた」と読み違える。
 */
function withIndexedEntry(heading: string, type: string, id: string): string {
  const text = withEntry(heading);
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`| **${type}. `));
  if (i < 0) throw new Error(`型 ${type} の行が無い`);
  const parts = lines[i].split("|");
  parts[3] = `${parts[3].trimEnd()}, **${id}** `;
  lines[i] = parts.join("|");
  return lines.join("\n");
}

/** 型表の行から ID を1つ消す。 */
function dropFromRow(text: string, type: string, id: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`| **${type}. `));
  if (i < 0) throw new Error(`型 ${type} の行が無い`);
  const before = lines[i];
  lines[i] = before.replace(new RegExp(`, \\*\\*${id}\\*\\*`), "");
  if (lines[i] === before) throw new Error(`型 ${type} の行に ${id} が無い`);
  return lines.join("\n");
}

describe("checkLedger（陽性対照 — 正しい文書は通る）", () => {
  it("実物の MISTAKE_LEDGER.md は通る", () => {
    const r = checkLedger(real);
    expect(r.error).toBe(null);
    expect(r.ok).toBe(true);
    expect(r.ids.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
  });

  it("旧番号を持たない新規エントリを足しても通る（新規に旧番号は要らない／型表にも足す）", () => {
    const r = checkLedger(
      withIndexedEntry("## M-20260915-brand-new 新規エントリ（2026-09-15・型 A）", "A", "M-20260915-brand-new"),
    );
    expect(r.error).toBe(null);
    expect(r.ids.length).toBe(checkLedger(real).ids.length + 1);
  });

  it("型を名乗らない見出し（旧番号だけ）には型表を要求しない", () => {
    // 旧番号だけの見出しは45件あり、全件が旧番号で表に載っている（2026-10-10 実測）。
    // ここで型の宣言を強制すると初日から45件赤になる。
    const r = checkLedger(withEntry("## M-20260915-legacy-shaped 旧番号だけの見出し（2026-09-15・旧 M-997）"));
    expect(r.error).toBe(null);
  });

  it("コードフェンスの中の書式例は見出しとして読まない（誤検出でコミットを止めない）", () => {
    // 台帳は自分の書式を自分の中で説明する文書なので、これは正当な書き方である。
    const fenced = `${real}\n\`\`\`markdown\n## M-060 旧形式の見出しの例（2026-09-08・型 A）\n\`\`\`\n`;
    expect(checkLedger(fenced).error).toBe(null);
  });

  it("コードフェンスの中に既存 ID と同じ例を書いても重複扱いしない", () => {
    const id = checkLedger(real).ids[0];
    const fenced = `${real}\n\`\`\`markdown\n## ${id} 例（2026-09-15・型 A）\n\`\`\`\n`;
    expect(checkLedger(fenced).error).toBe(null);
  });

  it("旧番号の既知重複をちょうど 10 組・余剰 10 として読む（定数と実物が一致している）", () => {
    const r = checkLedger(real);
    expect(r.legacyDupes).toHaveLength(10);
    expect(r.legacyExcess).toBe(KNOWN_LEGACY_EXCESS);
  });
  it("型表を型ごとに1本として読み、行数が床を下回らない", () => {
    const r = checkLedger(real);
    expect(r.error).toBe(null);
    // **厳密値で固定しない。** 型を1つ増やすのはこの表の唯一の定常変更で、
    // `toBe` にすると**正しい編集でテストが赤になる**（/code-review 指摘）。
    // スクリプト側の ponytail も「上げ忘れても検査は成立する」と書いている。
    // 上の MIN_ENTRIES の陽性対照と同じ形に揃える。
    expect(r.typeRows).toBeGreaterThanOrEqual(MIN_TYPE_ROWS);
  });

  it("フェンス外で型表の行を引用しても落ちない（pre-commit を止めない）", () => {
    // **これが無いと、台帳が自分の書式を説明した日にリポジトリ全体のコミットが止まる。**
    // 初版は全文を走査しており、`A 行×2` を出して落ちた（/code-review が実測）。
    // 台帳は「自分の書式を自分の中で説明する」文書なので、この引用は正常な本文である。
    const quoted = `${real}\n\n## 付録\n\n| 型 | 中身 | 該当 |\n|---|---|---|\n| **A. 道具を検証しない** | 引用 | M-001 |\n`;
    expect(checkLedger(quoted).error, "正しい文書が落ちている").toBe(null);
  });

  it("表に無い文字を本文で引用しても行数が増えない（消えた行を隠さない）", () => {
    // 逆向きの穴。`| **M. …` の引用が行数を13に増やすと、**本当に消えた行を隠す**。
    const quoted = `${real}\n\n本文の引用:\n\n| **M. 架空の型** | 中身 | M-001 |\n`;
    const r = checkLedger(quoted);
    expect(r.error).toBe(null);
    expect(r.typeRows, "表の外の行を数えている").toBe(checkLedger(real).typeRows);
  });
});

describe("checkLedger（陰性対照 — 壊れを1つずつ入れる）", () => {
  it("新 ID が重複したら落ちる", () => {
    // 日付は ID と一致させる。ずらすと日付検査（先に走る）の方で落ちてしまい、
    // 重複検査が動いたことを確かめられない。
    const first: string = checkLedger(real).ids[0];
    const date = `${first.slice(2, 6)}-${first.slice(6, 8)}-${first.slice(8, 10)}`;
    const r = checkLedger(withEntry(`## ${first} 同じ ID の2件目（${date}・型 A）`));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ID が重複している");
    expect(r.error).toContain(first);
  });

  it("旧形式の見出し（`## M-060 …`）が残っていたら落ちる", () => {
    const broken = mutateHeading(real, 0, () => "## M-060 旧形式の見出し（2026-09-08・型 A）");
    expect(checkLedger(broken).error).toContain("ID の書式から外れた見出し");
  });

  it("スラッグに大文字が混じったら落ちる", () => {
    const broken = mutateHeading(real, 0, (h) => h.replace(/^## M-(\d{8})-([a-z])/, "## M-$1-X"));
    expect(checkLedger(broken).error).toContain("ID の書式から外れた見出し");
  });

  it("表題を付け忘れたら落ちる（ID だけの見出し）", () => {
    const broken = mutateHeading(real, 0, (h) => h.match(/^## M-\d{8}-[a-z0-9-]+/)![0]);
    expect(checkLedger(broken).error).toContain("ID の書式から外れた見出し");
  });

  it("まだ重複していない旧番号で新しい重複を作ったら落ちる", () => {
    const uniq = uniqueLegacyNumbers();
    const broken = real.replace(`・旧 ${uniq[1]}）`, `・旧 ${uniq[0]}）`);
    const r = checkLedger(broken);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(`旧番号の余剰が ${KNOWN_LEGACY_EXCESS + 1} に増えた`);
  });

  it("**既に重複している**旧番号の3件目でも落ちる（組数ではなく余剰で見ている）", () => {
    // 組数で見ていると M-060 は既に1組なので、3件目を足しても組数が変わらず素通りする。
    // 重複しやすいのは、まさに既に重複している10個の方である（PR #1089 の指摘）。
    const already = checkLedger(real).legacyDupes[0];
    const r = checkLedger(withEntry(`## M-20260916-third-copy 3件目（2026-09-16・型 A・旧 ${already}）`));
    expect(r.ok).toBe(false);
    expect(r.error).toContain(`旧番号の余剰が ${KNOWN_LEGACY_EXCESS + 1} に増えた`);
  });

  it("別名が見出しの末尾に無くても数える（項目の順で抜け道を作らせない）", () => {
    const already = checkLedger(real).legacyDupes[0];
    const r = checkLedger(withEntry(`## M-20260916-alias-mid 途中に別名（2026-09-16・旧 ${already}・型 A）`));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("旧番号の余剰");
  });

  it("ID の日付が見出しの日付と食い違ったら落ちる", () => {
    const r = checkLedger(withEntry("## M-20270101-future-id 未来日の ID（2026-09-15・型 A）"));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ID の日付と見出しの日付が一致しない");
  });

  it("見出しの書式が変わって1件も読めなくなったら落ちる（検査が永久に緑にならない）", () => {
    expect(checkLedger(real.replace(/^## M-/gm, "## MISTAKE M-")).error).toContain("エントリが 0 件");
  });

  it("エントリが下限を割ったら落ちる", () => {
    const total = checkLedger(real).ids.length;
    let removed = 0;
    const broken = real
      .split("\n")
      .filter((l) => !(/^## M-/.test(l) && removed++ < 3))
      .join("\n");
    const r = checkLedger(broken, { minEntries: total });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(`エントリが ${total - 3} 件しか読めなかった`);
  });

  it("型表の行が2本になったら落ちる（マージで「両側を残す」をやった形）", () => {
    // 2026-10-07 に実際にこれで壊し、ID 一覧が食い違った状態をマージした
    // （M-20261007-merge-duplicated-the-ledger-type-row-and-i-verified-the-wrong-thing）。
    // そのとき決めた「grep で1本かを確かめる」習慣は、10-09 の4回のマージで
    // 4回とも手で打つ必要があった。だから検査にした。
    const lines = real.split("\n");
    const i = lines.findIndex((l) => /^\| \*\*[A-Z]\. /.test(l));
    expect(i, "型表の行が1行も見つからない＝検査が何も見ていない").toBeGreaterThan(-1);
    const dupe = [...lines.slice(0, i + 1), lines[i], ...lines.slice(i + 1)].join("\n");
    const r = checkLedger(dupe);
    expect(r.error).toContain("型表の行が重複している");
    expect(r.error, "直し方（和集合で1本に戻す）が出ていないと、また両側を残してしまう").toContain("和集合");
  });

  it("表が実在しない ID を指したら落ちる（打ち間違い・改名の置き忘れ）", () => {
    const broken = real.replace(/^\| \*\*A\. .*$/m, (row) => `${row.slice(0, -1)}, **M-20991231-does-not-exist** |`);
    expect(broken, "A 行の書き換えが当たっていない").not.toBe(real);
    const r = checkLedger(broken);
    expect(r.error).toContain("実在しない ID を指している");
    expect(r.error).toContain("M-20991231-does-not-exist");
  });

  it("**書式から外れた**打ち間違いも落ちる（大文字混入・日付の桁落ち）", () => {
    // 当初は `M-\d{8}-[a-z0-9-]+` に限っており、**打ち間違いは「一致しない」ので素通り**していた
    // —— 検査7が止めるはずの誤りそのもの（/code-review が両方とも実測）。
    for (const typo of ["M-20991231-Does-Not-Exist", "M-2099123-does-not-exist"]) {
      const broken = real.replace(/^\| \*\*A\. .*$/m, (row) => `${row.slice(0, -1)}, **${typo}** |`);
      expect(broken, `${typo} の書き換えが当たっていない`).not.toBe(real);
      const r = checkLedger(broken);
      expect(r.error, `${typo} が素通りした`).toContain("実在しない ID を指している");
      expect(r.error).toContain(typo);
    }
  });

  it("型表以外の表（旧番号の対応表）が死んだ ID を指しても落ちる", () => {
    // 冒頭の「旧番号が重複していた10組」の表も同じ索引で、同じ壊れ方をする。
    // 範囲を型表に限る理由が無い（/code-review 指摘）。
    const first = checkLedger(real).ids.find((id: string) => real.includes(`| \`${id}\` |`));
    const target = first ?? "M-20260907-no-negative-control";
    const broken = real.replace(`\`${target}\``, "`M-20991231-does-not-exist`");
    expect(broken, "旧番号表の書き換えが当たっていない").not.toBe(real);
    const r = checkLedger(broken);
    expect(r.error).toContain("実在しない ID を指している");
  });

  it("型表の行が読めなくなったら落ちる（書式が変わって0件になる形）", () => {
    // 「重複が無い」だけを見ると、表の書式が変わって0行になった日から永久に緑になる（型 A）。
    const flattened = real.replace(/^\| \*\*([A-Z])\. /gm, "| $1. ");
    expect(flattened, "行頭の書き換えが当たっていない").not.toBe(real);
    const r = checkLedger(flattened);
    expect(r.error).toContain("型表の行が");
    expect(r.error).toContain("下限は");
  });
});

describe("checkLedger（陰性対照 — 検査8: 索引の逆向き）", () => {
  it("型を名乗ったのに型表の行に無いと落ちる", () => {
    const r = checkLedger(withEntry("## M-20260915-not-indexed 表に足し忘れた（2026-09-15・型 A）"));
    expect(r.error).toContain("見出しが名乗る型の行に載っていない組が 1 件");
    expect(r.error).toContain("M-20260915-not-indexed → 型 A");
    expect(r.error, "直し方が書かれていない").toContain("--fix");
  });

  it("2つの型を名乗って両方に無いと2件として落ちる", () => {
    const r = checkLedger(withEntry("## M-20260915-two-types 2軸（2026-09-15・型 A／C）"));
    expect(r.error).toContain("組が 2 件");
    expect(r.error).toContain("→ 型 A");
    expect(r.error).toContain("→ 型 C");
  });

  it("既存のエントリを型表の行から消すと落ちる（索引が腐る形）", () => {
    // 2026-10-10 の補完で入れた1件。消せば、その型を引いたときに出てこなくなる。
    const broken = dropFromRow(real, "F", "M-20261009-wrote-an-interval-without-subtracting-two-timestamps");
    const r = checkLedger(broken);
    expect(r.error).toContain("M-20261009-wrote-an-interval-without-subtracting-two-timestamps → 型 F");
  });

  it("行が無い型を名乗ると落ちる（型 Z のような誤記）", () => {
    const r = checkLedger(withEntry("## M-20260915-bogus-type 存在しない型（2026-09-15・型 Z）"));
    expect(r.error).toContain("M-20260915-bogus-type → 型 Z");
  });

  it("表題の中の「型 A」という言及は宣言として読まない（誤検出でコミットを止めない）", () => {
    const r = checkLedger(
      withEntry("## M-20260915-mentions-type 型 A の再発防止が効かなかった話（2026-09-15・旧 M-996）"),
    );
    expect(r.error, "末尾の括弧の外の言及を拾っている").toBe(null);
  });
});

describe("checkLedger（陰性対照 — /code-review 2026-10-10 の13件）", () => {
  /** 型表の行を1つ書き換える。 */
  function editRow(text: string, type: string, fn: (row: string) => string): string {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => l.startsWith(`| **${type}. `));
    if (i < 0) throw new Error(`型 ${type} の行が無い`);
    const before = lines[i];
    lines[i] = fn(before);
    if (lines[i] === before) throw new Error("書き換えが当たっていない");
    return lines.join("\n");
  }

  it("末尾のパイプが落ちた行は名指しで落ちる（以前は undefined.matchAll で死んでいた）", () => {
    // TYPE_ROW_RE には当たるので 6-a/6-b を通り抜ける。pre-commit がスタックトレースで
    // 死ぬと、何が悪いのか読めないままリポジトリ全体のコミットが止まる。
    const r = checkLedger(editRow(real, "H", (row) => row.replace(/ \|$/, "")));
    expect(r.error).toContain("「該当」列が読めない");
    expect(r.error).toContain("**H.");
  });

  it("列が1つだけになった行も落ちる", () => {
    // 型の名前のセルだけ残す（空行にすると表のブロックが途中で切れて別の検査が落ちる）。
    const r = checkLedger(editRow(real, "H", (row) => row.replace(/^(\| [^|]*)\|.*$/, "$1")));
    expect(r.error).toContain("「該当」列が読めない");
  });

  it("中身のセルにパイプが入っても誤検出しない（列を決め打ちしない）", () => {
    // `split("|")[3]` だと列がずれ、その型の全エントリが「未掲載」になって
    // しかも --fix が直せない状態になる。
    const r = checkLedger(
      editRow(real, "G", (row) => {
        const cells = row.split("|");
        cells[2] = `${cells[2]} \`a|b\` の例`; // 中身のセルにパイプを足す
        return cells.join("|");
      }),
    );
    expect(r.error, "正しい表編集が落ちている").toBe(null);
  });

  it("同じ型を2度名乗っても1件として数える（`型 A／A`）", () => {
    const text = withEntry("## M-20260915-twice 同じ型を2度（2026-09-15・型 A／A）");
    expect(checkLedger(text).error).toContain("組が 1 件");
    // 補完も1回だけ。2回入れると該当セルに同じ ID が並ぶ。
    expect(fixLedger(text).added).toEqual(["M-20260915-twice → 型 A"]);
  });

  it("`型 E、併せて型 A` の2つ目も宣言として読む（実物にある形）", () => {
    // 前のアンカーを `[一-龥ぁ-んァ-ンA-Za-z]` に広げたら、`て`（かな）で2つ目が消えた。
    // 全見出しで突き合わせたら、アンカー無しと「漢字のみ除外」はどちらも 222 組で一致し、
    // 広げた版は 216 組だった（実データを6件落とす）。
    const r = checkLedger(withEntry("## M-20260915-awasete 2軸（2026-09-15・型 E、併せて型 A）"));
    expect(r.error).toContain("M-20260915-awasete → 型 E");
    expect(r.error, "「併せて型 A」が宣言として読まれていない").toContain("M-20260915-awasete → 型 A");
  });

  it("`新型 Bug` のような本文を型の宣言として読まない", () => {
    const r = checkLedger(withEntry("## M-20260915-phantom 偽陽性（2026-09-15・型 A・新型 Bug を踏んだ）"));
    expect(r.error, "型 A は本当に未掲載なので赤でよい").toContain("M-20260915-phantom → 型 A");
    expect(r.error, "新型 Bug を型 B の宣言として読んでいる").not.toContain("→ 型 B");
  });

  it("本文で型表のヘッダを引用しても0行にならない", () => {
    // 行の引用には対処していたが、**ヘッダの引用**を見ていなかった。
    // 0行になると検査6-b の床が落ちて、正しい文書が全コミットを止める。
    // **引用の後ろに本文が続く形**にする。`slice(h + 2)` がその本文に当たって
    // 行が0本になり、候補を1つしか試さない実装はそこで諦める（変異で確認済み）。
    const quoted = real.replace(
      "| 型 | 中身 | 該当 |",
      "表の形は次のとおり。\n\n| 型 | 中身 | 該当 |\n\nこの3列で書く。\n\n| 型 | 中身 | 該当 |",
    );
    expect(quoted, "置換が当たっていない").not.toBe(real);
    const r = checkLedger(quoted);
    expect(r.error, "正しい文書が落ちている").toBe(null);
    expect(r.typeRows).toBeGreaterThanOrEqual(MIN_TYPE_ROWS);
  });

  it("表の行が重複している間は kind が unindexed にならない（--fix に書かせない）", () => {
    // 重複した行に補完すると、同じ ID を両方の行に入れて壊れを深くする。
    // 2026-10-07 に実際に起きた形（M-20261007-merge-duplicated-the-ledger-type-row-…）。
    const lines = real.split("\n");
    const i = lines.findIndex((l) => l.startsWith("| **A. "));
    lines.splice(i + 1, 0, lines[i]);
    const r = checkLedger(lines.join("\n"));
    expect(r.error).toContain("型表の行が重複している");
    expect(r.kind, "--fix が書き込んでしまう").not.toBe("unindexed");
  });

  it("置き先の行が無い型は、赤になるが補完できない（呼び出し側が見分けられる）", () => {
    const text = withEntry("## M-20260915-bogus-type2 型の誤記（2026-09-15・型 Z）");
    expect(checkLedger(text).kind).toBe("unindexed");
    expect(fixLedger(text).added, "置けないのに置いたと言っている").toEqual([]);
  });
});

describe("checkLedger（陰性対照 — Codex 2026-10-10 の7件）", () => {
  function editRow(text: string, type: string, fn: (row: string) => string): string {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => l.startsWith(`| **${type}. `));
    if (i < 0) throw new Error(`型 ${type} の行が無い`);
    const before = lines[i];
    lines[i] = fn(before);
    if (lines[i] === before) throw new Error("書き換えが当たっていない");
    return lines.join("\n");
  }

  it("既存 ID に接尾辞が付いた参照を落とす（前半だけ一致して素通りしていた）", () => {
    const broken = real.replace(
      "**M-20260915-dupe-count-from-truncated-grep**",
      "**M-20260915-dupe-count-from-truncated-grep_typo**",
    );
    expect(broken, "置換が当たっていない").not.toBe(real);
    expect(checkLedger(broken).error).toContain("M-20260915-dupe-count-from-truncated-grep_typo");
  });

  it("型のラベルが化けたら、その型を名指しで落とす（行数の床だけでは通る）", () => {
    // A → M。12行・重複なしのまま通っていた。検査8が「65件が未掲載」と言うだけで、
    // 原因を名指しできていなかった。
    const broken = editRow(real, "A", (row) => row.replace("| **A. ", "| **M. "));
    const r = checkLedger(broken);
    expect(r.error).toContain("型表に無い型がある: A");
  });

  it("書式の崩れた行は濾さずに落とす（崩れた重複行が黙って捨てられていた）", () => {
    const lines = real.split("\n");
    const i = lines.findIndex((l) => l.startsWith("| **A. "));
    lines.splice(i + 1, 0, "| **A.名前が詰まっている** | 中身 | M-001 |");
    const r = checkLedger(lines.join("\n"));
    expect(r.error).toContain("行の書式から外れた行が 1 行");
  });

  it("実在しない旧番号を落とす（旧番号の書式に当たるだけで通っていた）", () => {
    const broken = editRow(real, "A", (row) => row.replace("M-001", "M-9999"));
    expect(checkLedger(broken).error).toContain("M-9999");
  });

  it("旧番号の対応表の打ち間違いも落とす（索引の表2つを見る）", () => {
    const broken = real.replace("| `M-060` | 2026-09-07 |", "| `M-9999` | 2026-09-07 |");
    expect(broken, "置換が当たっていない").not.toBe(real);
    expect(checkLedger(broken).error).toContain("M-9999");
  });

  it("エントリ本文の説明用の表に ID を書いても落ちない（誤検出でコミットを止めない）", () => {
    // 台帳は「消した ID」「打ち間違えた ID」を表で説明することがある。
    // `| ` で始まる全行を見ていたので、それを索引の参照と読んで全コミットを止めていた。
    const text = `${real}\n## 付録\n\n| 事例 | 結果 |\n|---|---|\n| \`M-20260915-deleted-entry\` を参照していた | 落ちた |\n`;
    expect(checkLedger(text).error, "正しい文書が落ちている").toBe(null);
  });
});

describe("checkLedger（陰性・陽性対照 — /code-review 2026-10-10 の2巡目10件）", () => {
  function editRow(text: string, type: string, fn: (row: string) => string): string {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => l.startsWith(`| **${type}. `));
    if (i < 0) throw new Error(`型 ${type} の行が無い`);
    const before = lines[i];
    lines[i] = fn(before);
    if (lines[i] === before) throw new Error("書き換えが当たっていない");
    return lines.join("\n");
  }
  /** 中身のセルにテキストを足す（行の列数は変えない）。 */
  const addToMiddle = (row: string, extra: string) => {
    const cells = row.split("|");
    cells[2] = `${cells[2]}${extra}`;
    return cells.join("|");
  };

  it("型表の中身セルに区切り無しで ID を書いても落ちない（索引の列だけ見る）", () => {
    // `（M-20260915-brand-new の形）` は `M-20260915-brand-newの形` というトークンになる。
    // 行を丸ごと走査していたので、これが「実在しない ID」として全コミットを止めていた。
    const text = editRow(real, "G", (row) => addToMiddle(row, "（M-20260915-brand-new の形）"));
    expect(checkLedger(text).error, "正しい文書が落ちている").toBe(null);
  });

  it("旧番号の対応表の表題に ID を書いても落ちない", () => {
    const text = real.replace(
      "| `M-060` | 2026-09-07 | `M-20260907-no-negative-control` |",
      "| `M-060` | 2026-09-07 | `M-20260907-no-negative-control` | M-060の件。",
    );
    expect(text, "置換が当たっていない").not.toBe(real);
    expect(checkLedger(text).error, "正しい文書が落ちている").toBe(null);
  });

  it("本物の表より前にヘッダ＋行1本を引用しても、行数の多いブロックを採る", () => {
    const text = real.replace(
      "| 型 | 中身 | 該当 |",
      "書式の例:\n\n| 型 | 中身 | 該当 |\n|---|---|---|\n| **A. 道具を検証しない** | 例 | M-001 |\n\n| 型 | 中身 | 該当 |",
    );
    expect(text, "置換が当たっていない").not.toBe(real);
    const r = checkLedger(text);
    expect(r.error, "引用のブロックを本物として採っている").toBe(null);
    expect(r.typeRows).toBeGreaterThanOrEqual(MIN_TYPE_ROWS);
  });

  it("該当列が落ちて中身にパイプが入った行を落とす（列数では判別できない形）", () => {
    // 内側3セルなので「正しい3列」と区別が付かない。該当列が ID の並びであることで判別する。
    const text = editRow(real, "G", (row) => {
      const cells = row.split("|");
      return `|${cells[1]}| 説明 \`a|b\` |`;
    });
    const r = checkLedger(text);
    expect(r.error).toContain("「該当」列が読めない");
    // そのまま --fix させると散文セルに ID を書き込んでいた。置かないことを固定する。
    expect(fixLedger(text).added).toEqual([]);
  });

  it("中身セルにパイプが入った正しい行でも --fix が該当列に置ける", () => {
    const text = `${editRow(real, "G", (row) => addToMiddle(row, " \`a|b\` の例"))}\n## M-20260915-pipe-case 中身にパイプ（2026-09-15・型 G）\n\n本文。\n`;
    const before = checkLedger(text);
    expect(before.kind).toBe("unindexed");
    const { text: fixed, added } = fixLedger(text, before.pairs);
    expect(added).toEqual(["M-20260915-pipe-case → 型 G"]);
    expect(checkLedger(fixed).error, "置いたのに緑にならない").toBe(null);
  });

  it("旧番号の対応表が読めなくなったら落ちる（被覆が黙って消える形）", () => {
    const text = real.replace("| 旧番号 | 日付 | 新 ID | 表題 |", "| 旧番号 | 日付 | 新ID | 表題 |");
    expect(text, "置換が当たっていない").not.toBe(real);
    const r = checkLedger(text);
    expect(r.error).toContain("旧番号の対応表の行が");
    expect(r.error).toContain(`下限は ${MIN_LEGACY_ROWS} 行`);
  });

  it("見出しの型の書き方が変わったら落ちる（検査8が0件＝永久に緑になる形）", () => {
    const text = real.replace(/・型 ([A-Z])）/g, "・分類$1）");
    expect(text, "置換が当たっていない").not.toBe(real);
    const r = checkLedger(text);
    expect(r.error).toContain("型を名乗る見出しが");
    expect(r.error).toContain(`下限は ${MIN_TYPED_HEADINGS} 件`);
  });

  it("行数の床は REQUIRED_TYPES から導いている（同じ事実を2箇所に持たない）", () => {
    expect(MIN_TYPE_ROWS).toBe(12);
  });

  it("検査が出した欠落の組を --fix にそのまま渡せる", () => {
    const text = withEntry("## M-20260915-pass-pairs 組を渡す（2026-09-15・型 A）");
    const before = checkLedger(text);
    expect(before.pairs).toEqual([{ id: "M-20260915-pass-pairs", type: "A" }]);
    expect(fixLedger(text, before.pairs).added).toEqual(["M-20260915-pass-pairs → 型 A"]);
  });
});

describe("fixLedger（補完器）", () => {
  it("足し忘れを埋めると検査が通る", () => {
    const broken = withEntry("## M-20260915-not-indexed 表に足し忘れた（2026-09-15・型 A）");
    expect(checkLedger(broken).error).toContain("載っていない組");
    const { text, added } = fixLedger(broken);
    expect(added).toEqual(["M-20260915-not-indexed → 型 A"]);
    expect(checkLedger(text).error).toBe(null);
  });

  it("日付の昇順の位置に入れる（末尾に積まない）", () => {
    // 2026-09-15 の ID は、A 行の 2026-09-16 以降の ID より前に入るはず。
    const broken = withEntry("## M-20260915-not-indexed 表に足し忘れた（2026-09-15・型 A）");
    const row = fixLedger(broken)
      .text.split("\n")
      .find((l: string) => l.startsWith("| **A. "))!;
    const ids = row
      .split("|")[3]
      .split(",")
      .map((x: string) => x.trim().replace(/\*/g, ""));
    const at = ids.indexOf("M-20260915-not-indexed");
    expect(at, "入っていない").toBeGreaterThanOrEqual(0);
    const dated = (xs: string[]) => xs.filter((i: string) => /^M-\d{8}-/.test(i));
    const after = dated(ids.slice(at + 1));
    const before = dated(ids.slice(0, at));
    // **末尾に積まれても `after` が空になり、every が真になって素通りする。**
    // 変異テスト（挿入位置を末尾固定にする）が0件赤で露呈した。後ろに新しい日付が
    // 実際にあることを先に固定する。
    expect(after.length, "末尾に積まれている（後ろに日付 ID が無い）").toBeGreaterThan(0);
    expect(after.every((i: string) => i.slice(2, 10) >= "20260915"), `後ろに古い日付がある: ${after[0]}`).toBe(true);
    // **`before.every(…<= 20260915)` は findIndex の定義から必ず真で、何も見ていない。**
    // 片方（after）の空振りを変異で直したのに、鏡像をそのまま残していた（型 J・/code-review 指摘）。
    // 隣を名指しで固定する: 直前の日付 ID は「20260915 以下の中でいちばん新しいもの」。
    const expectedPrev = [...before].filter((i: string) => i.slice(2, 10) <= "20260915").at(-1);
    expect(before.at(-1), "直前が、20260915 以下でいちばん新しい ID になっていない").toBe(expectedPrev);
    expect(before.length, "前に日付 ID が1つも無い（実物の A 行なら必ずある）").toBeGreaterThan(0);
  });

  it("フェンス外で引用された表の行は書き換えない（本文を壊さない）", () => {
    // 台帳は自分の書式を自分の中で説明する文書なので、表の行の引用は正当な書き方である。
    // 生の全行から行を拾うと、この引用にも ID を挿してしまう（検査側は #1289 で同じ穴を塞いだ）。
    const quoted = "| **A. 道具を検証しない** | 引用 | M-001 |";
    const text = `${withEntry("## M-20260915-not-indexed 表に足し忘れた（2026-09-15・型 A）")}\n## 付録\n\n${quoted}\n`;
    const { text: fixed, added } = fixLedger(text);
    expect(added).toEqual(["M-20260915-not-indexed → 型 A"]);
    expect(fixed.split("\n").filter((l: string) => l === quoted).length, "引用が書き換えられている").toBe(1);
    expect(checkLedger(fixed).error).toBe(null);
  });

  it("フェンスの中の表の行も書き換えない", () => {
    const fencedRow = "| **A. 道具を検証しない** | 書式の例 | M-001 |";
    const text = `${withEntry("## M-20260915-not-indexed 表に足し忘れた（2026-09-15・型 A）")}\n\`\`\`markdown\n${fencedRow}\n\`\`\`\n`;
    const { text: fixed } = fixLedger(text);
    expect(fixed.split("\n").filter((l: string) => l === fencedRow).length, "フェンスの中が書き換えられている").toBe(1);
  });

  it("埋まっている文書は何も変えない", () => {
    const { text, added } = fixLedger(real);
    expect(added).toEqual([]);
    expect(text).toBe(real);
  });
});

/** まだ重複していない旧番号。**見出し行だけを見る**（本文の言及を拾わない）。 */
function uniqueLegacyNumbers(): string[] {
  const nums = real
    .split("\n")
    .filter((l) => /^## M-/.test(l))
    .flatMap((l) => [...l.matchAll(/・旧 (M-\d+)(?=[・）])/g)].map((m) => m[1]));
  const count = new Map<string, number>();
  for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1);
  return nums.filter((n) => count.get(n) === 1);
}
