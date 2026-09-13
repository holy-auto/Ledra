/**
 * 固定列グリッドが**モバイルで潰れない**ことを固定する。
 *
 * ## なぜ要るか
 *
 * `grid-cols-2` のようにブレークポイント接頭辞の無い固定列は、画面幅に関係なく
 * その列数を保つ。入力欄を並べたフォームだと、400px 幅で1列あたり 150px 程度まで
 * 潰れ、ラベルが折り返して読めなくなる。
 *
 * ただし**固定が正解のものもある**。カレンダーの曜日列（7列）は7列でなければ
 * 意味を成さないし、25セルの装飾グリッドは `w-16 h-16` の中の飾りでしかない。
 * 一律に接頭辞を付けると、そちらが壊れる。
 *
 * そこで**残っている固定列を1件残らず数えて、意図的なものとして明記する**。
 * 新しくフォームに素の固定列を足すと、この数が合わなくなって落ちる。
 *
 * 落ちたときは2択:
 * - モバイルで潰れるなら → `grid-cols-1 sm:grid-cols-2` のように接頭辞を付ける
 * - 固定が正解なら → 下の表に理由を書いて数を更新する
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();

/**
 * 対象外のディレクトリ。
 *
 * マーケティングとピッチ資料は、**製品画面のミニチュア模型**（`text-[0.5rem]` の
 * 疑似ダッシュボード）と固定レイアウトのスライドでできている。縮小した見た目
 * そのものが成果物なので、レスポンシブにすると設計意図が壊れる。
 */
const EXCLUDED_DIRS = ["src/components/marketing/", "src/app/(marketing)/", "src/app/pitch/"];

/**
 * **接頭辞なしの固定列を意図して残しているファイルと、その件数。**
 *
 * | ファイル | なぜ固定でよいか |
 * |---|---|
 * | `CalendarView` / `booking`(7列×2) | カレンダーの曜日列。7列でなければ意味を成さない |
 * | `PhotoCompare` / `MediaUploadSection` | Before/After の対比。2枚並べることが目的 |
 * | `DataTable` | **これ自体がモバイル用のカード表示**。1列にすると縦に伸びすぎる |
 * | `PosClient`(3) | レジのタッチ操作前提のタイル。3列は指で押せる大きさで設計済み |
 * | `StorefrontJobWorkflow` | 4段の進行バー。横一列であることが進行の表現 |
 * | `DisplayModeOnboarding` | `aria-hidden` の装飾プレビュー |
 * | `booking`(2列) / `AiExplainPanel` / `shop` | 短いラベルのボタン2つ。400px でも押せる |
 * | その他 | ラベルと値の対（`dt`/`dd` 相当）。2列のまま読める短さ |
 */
const INTENTIONAL_FIXED_GRIDS: Record<string, number> = {
  "src/app/admin/DisplayModeOnboarding.tsx": 1,
  "src/app/admin/StorefrontDashboard.tsx": 1,
  "src/app/admin/analytics/staff/StaffPerformanceClient.tsx": 1,
  "src/app/admin/certificates/[public_id]/MediaUploadSection.tsx": 1,
  "src/app/admin/certificates/[public_id]/PhotoTamperingPanel.tsx": 1,
  "src/app/admin/jobs/[id]/StorefrontJobWorkflow.tsx": 1,
  "src/app/admin/market-vehicles/[id]/VehicleDetailClient.tsx": 1,
  "src/app/admin/pos/PosClient.tsx": 3,
  "src/app/admin/reservations/CalendarView.tsx": 2,
  "src/app/admin/shop/page.tsx": 1,
  "src/app/agent/apply/status/page.tsx": 1,
  "src/app/agent/invoices/page.tsx": 1,
  "src/app/customer/[tenant]/booking/page.tsx": 3,
  "src/app/manufacturer/templates/TemplatesClient.tsx": 1,
  "src/app/parts/confirm/[token]/PartConfirmClient.tsx": 1,
  "src/app/video/page.tsx": 1,
  "src/components/certificates/AiExplainPanel.tsx": 1,
  "src/components/ui/DataTable.tsx": 1,
  "src/components/ui/PhotoCompare.tsx": 1,
};

const CLASS_ATTR = /class[Nn]ame="([^"]*)"/g;
/** `sm:grid-cols-2` の `:` を境界扱いしないよう、直前が `:` でないことを見る。 */
const BARE_FIXED = /(?<!:)\bgrid-cols-[2-9]\b/;
const HAS_BREAKPOINT = /\b(sm|md|lg|xl|2xl):grid-cols-/;

/** そのソースに、接頭辞なしの固定列が何箇所あるか。 */
export function countBareFixedGrids(src: string): number {
  let n = 0;
  for (const [, cn] of src.matchAll(CLASS_ATTR)) {
    if (BARE_FIXED.test(cn) && !HAS_BREAKPOINT.test(cn)) n += 1;
  }
  return n;
}

function scan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rel of readdirSync(join(REPO, "src"), { recursive: true, encoding: "utf8" })) {
    const p = `src/${String(rel).split("\\").join("/")}`;
    if (!/\.tsx?$/.test(p) || p.includes("__tests__")) continue;
    if (EXCLUDED_DIRS.some((d) => p.startsWith(d))) continue;
    const n = countBareFixedGrids(readFileSync(join(REPO, p), "utf8"));
    if (n > 0) out[p] = n;
  }
  return out;
}

describe("固定列グリッドのモバイル対応", () => {
  it("接頭辞なしの固定列は、意図的なものだけ", () => {
    // 落ちたら: 潰れるなら接頭辞を付ける。固定が正解なら上の表に理由を書いて数を直す。
    expect(scan()).toEqual(INTENTIONAL_FIXED_GRIDS);
  });

  it("検出器が空振りしていない", () => {
    // 素の固定列は拾う
    expect(countBareFixedGrids('<div className="grid grid-cols-2 gap-3">')).toBe(1);
    expect(countBareFixedGrids('<div className="grid gap-3 grid-cols-4 text-center">')).toBe(1);
    // 接頭辞付きは拾わない（`sm:grid-cols-2` の `:` を境界と誤認しないこと）
    expect(countBareFixedGrids('<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">')).toBe(0);
    expect(countBareFixedGrids('<div className="grid grid-cols-2 sm:grid-cols-4">')).toBe(0);
    // 1列は固定でも潰れないので対象外
    expect(countBareFixedGrids('<div className="grid grid-cols-1 gap-3">')).toBe(0);
  });
});
