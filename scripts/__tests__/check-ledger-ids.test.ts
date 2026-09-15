/**
 * `scripts/check-ledger-ids.mjs` のテスト。
 *
 * なぜ要るか: **陽性対照だけ置いて陰性対照を置かない**のがこの台帳の型 A の典型で、
 * 実際にそれをやっている（MISTAKE_LEDGER `M-20260907-no-negative-control`）。
 * 「無傷の台帳で OK が出る」は、検査が何も見ていなくても成立する。
 * ここでは**実物の MISTAKE_LEDGER.md に1箇所ずつ壊れを入れて、壊れごとに落ちること**を
 * 固定する。実物を使うのは、合成テキストだと「実際の見出しの書き方」から離れた瞬間に
 * 検査が空振りしていても気づけないため。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @ts-expect-error -- .mjs に型定義は無い。検査対象は実行時の挙動。
import { checkLedger, KNOWN_LEGACY_DUPES, MIN_ENTRIES } from "../check-ledger-ids.mjs";

const LEDGER = join(dirname(fileURLToPath(import.meta.url)), "../../docs/context/MISTAKE_LEDGER.md");
const real = readFileSync(LEDGER, "utf8");

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

describe("checkLedger（陽性対照）", () => {
  it("実物の MISTAKE_LEDGER.md は通る", () => {
    const r = checkLedger(real);
    expect(r.error).toBe(null);
    expect(r.ok).toBe(true);
    expect(r.ids.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
  });

  it("旧番号を持たない新規エントリを足しても通る（新規に旧番号は要らない）", () => {
    const r = checkLedger(`${real}\n## M-20260915-brand-new 新規エントリ（2026-09-15・型 A）\n\n本文。\n`);
    expect(r.error).toBe(null);
    expect(r.ids.length).toBe(checkLedger(real).ids.length + 1);
  });

  it("旧番号の既知重複をちょうど 10 組として読む（定数と実物が一致している）", () => {
    expect(checkLedger(real).legacyDupes).toHaveLength(KNOWN_LEGACY_DUPES);
  });
});

describe("checkLedger（陰性対照 — 壊れを1つずつ入れる）", () => {
  it("新 ID が重複したら落ちる", () => {
    const first = checkLedger(real).ids[0];
    const broken = mutateHeading(real, 1, (h) => h.replace(/^## M-\d{8}-[a-z0-9-]+/, `## ${first}`));
    const r = checkLedger(broken);
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

  it("旧番号の重複が既知の組数を超えたら落ちる", () => {
    // 重複していない旧番号を、別の非重複旧番号に付け替えて 11 組目を作る。
    const nums = [...real.matchAll(/・旧 (M-\d+)）/g)].map((m) => m[1]);
    const count = new Map<string, number>();
    for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1);
    const uniq = nums.filter((n) => count.get(n) === 1);
    const broken = real.replace(`・旧 ${uniq[1]}）`, `・旧 ${uniq[0]}）`);
    const r = checkLedger(broken);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(`旧番号の重複が ${KNOWN_LEGACY_DUPES + 1} 組に増えた`);
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
