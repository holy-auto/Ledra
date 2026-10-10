/**
 * 画面に絵文字を出さない（2026-10 方針: 「AI っぽく安っぽい」ため全ページから撤去）。
 * アイコンが要る所は heroicons outline の SVG を使う（admin/page.tsx のクイックアクション参照）。
 *
 * ponytail: 対象は画面のソース（src/app のうち api 以外と src/components、画面に出すデータ
 * モジュール）だけ。LINE / メール本文はチャネルの慣習が別なので見ない。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments, walkSource } from "./sourceScan";

// 既定で絵文字表示になる文字 + FE0F 付き + 文字表示が既定でも絵文字フォントで出がちな記号。
// → ✓ ★ ✕ ○ などの約物は対象外（UI の記号として使っている）。
const UI_EMOJI =
  /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[\u26A0\u23ED\u23F1\u23F9\u26D3\u2699\u270F\u270D\u2696\u267B\u2709\u2764\u2328]/u;

const root = join(__dirname, "..", "..");
const files = [
  ...walkSource(join(root, "app")).filter((p) => !p.includes(`${join(root, "app", "api")}`)),
  ...walkSource(join(root, "components")),
  join(root, "lib", "operationGuides.ts"),
  join(root, "lib", "academy", "scoring.ts"),
];

describe("UI に絵文字を出さない", () => {
  it("検出器が当たる/当たらない", () => {
    for (const s of ["🏃 飛び込み案件", "⚠ 注意", "⚠️", "✅", "✨", "📄"]) expect(UI_EMOJI.test(s), s).toBe(true);
    for (const s of ["→", "✓", "★", "✕", "○", "↗", "©"]) expect(UI_EMOJI.test(s), s).toBe(false);
  });

  it("画面のソースに絵文字が無い", () => {
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((p) =>
      stripComments(readFileSync(p, "utf8"), p)
        .split("\n")
        .flatMap((line, i) => (UI_EMOJI.test(line) ? [`${p.slice(root.length + 1)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
