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
import { checkLedger, KNOWN_LEGACY_EXCESS, MIN_ENTRIES } from "../check-ledger-ids.mjs";

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
