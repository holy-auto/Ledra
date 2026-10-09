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
import { checkLedger, KNOWN_LEGACY_EXCESS, MIN_ENTRIES, MIN_TYPE_ROWS } from "../check-ledger-ids.mjs";

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

describe("checkLedger（陽性対照 — 正しい文書は通る）", () => {
  it("実物の MISTAKE_LEDGER.md は通る", () => {
    const r = checkLedger(real);
    expect(r.error).toBe(null);
    expect(r.ok).toBe(true);
    expect(r.ids.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
  });

  it("旧番号を持たない新規エントリを足しても通る（新規に旧番号は要らない）", () => {
    const r = checkLedger(withEntry("## M-20260915-brand-new 新規エントリ（2026-09-15・型 A）"));
    expect(r.error).toBe(null);
    expect(r.ids.length).toBe(checkLedger(real).ids.length + 1);
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
