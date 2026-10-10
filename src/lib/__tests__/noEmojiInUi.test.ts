/**
 * 画面に絵文字を出さない（2026-10 方針: 「AI っぽく安っぽい」ため全ページから撤去）。
 * アイコンが要る所は heroicons outline の SVG を使う（admin/page.tsx のクイックアクション参照）。
 *
 * ponytail: 対象は画面のソース（src/app のうち api 以外と src/components、画面に出すデータ
 * モジュール）だけ。LINE / メール本文はチャネルの慣習が別なので見ない。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { stripComments, walkSource } from "./sourceScan";

// 絵文字にもなりうる絵記号（\p{Emoji} かつ Extended_Pictographic）。⚠ ⬇ のように文字表示が既定でも
// スマホでは色付き絵文字で出るので、それも拾う。矢印 (U+2190–21FF) と © ® ™ は約物として許す
// （→ ↗ を UI の記号として使っている）。✓ ★ ✕ ○ は \p{Emoji} でないので元々対象外。
const UI_EMOJI = /[\u2190-\u21FF]\uFE0F|(?![\u2190-\u21FF\u00A9\u00AE\u2122])(?=\p{Emoji})\p{Extended_Pictographic}/u;

const root = join(__dirname, "..", "..");
const files = [
  ...walkSource(join(root, "app")).filter((p) => !p.startsWith(join(root, "app", "api") + sep)),
  ...walkSource(join(root, "components")),
  join(root, "lib", "operationGuides.ts"),
  join(root, "lib", "academy", "scoring.ts"),
];

describe("UI に絵文字を出さない", () => {
  it("検出器が当たる/当たらない", () => {
    for (const s of ["🏃 飛び込み案件", "⚠ 注意", "⚠️", "✅", "✨", "📄", "⬇", "↗️"])
      expect(UI_EMOJI.test(s), s).toBe(true);
    for (const s of ["→", "✓", "★", "✕", "○", "↗", "©"]) expect(UI_EMOJI.test(s), s).toBe(false);
  });

  it("画面のソースに絵文字が無い", () => {
    expect(files.length).toBeGreaterThan(100);
    // ponytail: パーサ（stripComments）は重いので、生テキストで当たったファイルだけ通す。
    // 全ファイルを通すと CI で 5 秒を超える（M-20260913-ci-test-timeout と同じ形）。
    const hits = files.flatMap((p) => {
      const raw = readFileSync(p, "utf8");
      if (!UI_EMOJI.test(raw)) return [];
      return stripComments(raw, p)
        .split("\n")
        .flatMap((line, i) => (UI_EMOJI.test(line) ? [`${p.slice(root.length + 1)}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(hits).toEqual([]);
  });
});
