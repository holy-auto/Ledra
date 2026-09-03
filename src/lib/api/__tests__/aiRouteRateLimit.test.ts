/**
 * AI を呼ぶ API ルートにレート制限が入っていることを固定する。
 *
 * 認可（誰が呼べるか）は費用の上限にならない。staff 以上に絞っても、
 * 認証済みの1人がボタンを押し続ければ AI の課金は無制限に伸びる。
 *
 * 実際に抜けていた（2026-09-03）: `admin/academy/{cases,feedback,qa}` と
 * `admin/certificates/{ai-draft,ai-explain}`、`admin/purchase-orders/ai-message`
 * の6本。他の23本は同じ `checkRateLimit(req, "ai", ...)` を使っていたので、
 * 慣行から漏れただけだった。
 *
 * **検出器の選び方について。**
 * 最初 import の推移到達（`@/lib/ai/client` に辿り着くか）で洗ったが、
 * `isMissingTableError`（エラー判定）や `calcSizeClass`（純粋関数）のような
 * AI と無関係な関数まで拾い、47本という信用できない数が出た。
 * 「到達できる」は「モデルを呼ぶ」ではない。
 *
 * そこで**ルート自身が `@/lib/ai/client` からモデル選択を import しているか**を
 * signal にした。`modelForPlanTier` / `fastModelForPlanTier` を呼ぶのは
 * 「このリクエストでモデルを選んで叩く」ことを意味するので、推移到達より狭く、
 * かつ実態と一致する。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkSource } from "@/lib/__tests__/sourceScan";

const API_ROOT = join(process.cwd(), "src", "app", "api");

/** モデル選択を import している = このルートでモデルを叩く。 */
const PICKS_MODEL = /from\s+"@\/lib\/ai\/client"/;
const RATE_LIMITED = /checkRateLimit\s*\(/;

/**
 * レート制限を課さないことに理由があるルート。
 * 増やすときは、なぜユーザーが繰り返し叩けないのかを書くこと。
 */
const EXEMPT = new Map<string, string>([
  [
    "qstash/line-history-import",
    // QStash 署名必須のキューワーカー。auth セッションが無く、ユーザーが直接叩けない。
    // 1回の実行件数に上限（LINE_HISTORY_IMPORT_MAX、既定80）があり、月次コストキャップも尊重する。
    // リクエスト単位のレート制限はキューワーカーには意味を持たない。
    "QStash 署名付きの非同期ジョブ。実行件数の上限を自前で持つ",
  ],
]);

function routeName(file: string): string {
  return file
    .slice(API_ROOT.length + 1)
    .replace(/[\\/]route\.ts$/, "")
    .split(/[\\/]/)
    .join("/");
}

describe("AI を呼ぶ API ルートのレート制限", () => {
  const aiRoutes = walkSource(API_ROOT, (f) => f.endsWith("route.ts"))
    .filter((f) => PICKS_MODEL.test(readFileSync(f, "utf8")))
    .map((f) => ({ name: routeName(f), src: readFileSync(f, "utf8") }));

  it("検出器が実際に AI ルートを拾えている（空振りしていない）", () => {
    // 検出器が壊れて0件になると、下の2つが素通りで緑になる。
    expect(aiRoutes.length).toBeGreaterThan(20);
    expect(aiRoutes.map((r) => r.name)).toContain("admin/certificates/ai-quality");
  });

  it("モデルを呼ぶルートは、免除されていない限りレート制限を課している", () => {
    const missing = aiRoutes
      .filter((r) => !RATE_LIMITED.test(r.src) && !EXEMPT.has(r.name))
      .map((r) => r.name)
      .sort();
    expect(missing).toEqual([]);
  });

  it("免除リストに、もうレート制限が入ったものが残っていない（棚卸しの取りこぼしを防ぐ）", () => {
    const names = new Set(aiRoutes.map((r) => r.name));
    const stale = [...EXEMPT.keys()]
      .filter((name) => {
        const route = aiRoutes.find((r) => r.name === name);
        // 一覧から消えた（AI を呼ばなくなった）か、レート制限が入ったら免除は不要。
        return !names.has(name) || RATE_LIMITED.test(route!.src);
      })
      .sort();
    expect(stale).toEqual([]);
  });
});
