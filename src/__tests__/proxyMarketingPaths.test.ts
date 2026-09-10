/**
 * C-M1 是正の回帰確認。
 *
 * proxy.ts の x-robots-tag ヘッダは、metadata.robots（正本、レイアウト継承で
 * 自動的に正しく決まる）と違い、パスの前方一致リストを手で持っている。
 * この一覧は `src/app/(marketing)` の実際のディレクトリ構成とズレうる。
 * ズレた場合の実害は片方向のみ: 追加漏れが起きると、その新しいマーケティング
 * ページに誤って noindex ヘッダが付く（索引可否そのものは metadata.robots が
 * 決めるので致命傷ではないが、SEO 上の二重ガードが片方だけ効かなくなる）。
 * ここではそのズレを機械的に検出する。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isMarketingPath, MARKETING_ROUTE_SEGMENTS } from "@/proxy";

describe("isMarketingPath", () => {
  it("ルートと主要マーケティングページを noindex 対象から除外する", () => {
    expect(isMarketingPath("/")).toBe(true);
    expect(isMarketingPath("/pricing")).toBe(true);
    expect(isMarketingPath("/faq")).toBe(true);
  });

  it("マーケティングの動的サブページ（前方一致）も除外する", () => {
    expect(isMarketingPath("/blog/some-article")).toBe(true);
    expect(isMarketingPath("/cases/some-case")).toBe(true);
    expect(isMarketingPath("/features/nfc")).toBe(true);
    expect(isMarketingPath("/contact/agents")).toBe(true);
  });

  it("アプリ/テナント向けページは対象外にしない（noindex ヘッダを付ける側）", () => {
    expect(isMarketingPath("/admin")).toBe(false);
    expect(isMarketingPath("/agent")).toBe(false);
    expect(isMarketingPath("/manufacturer")).toBe(false);
    expect(isMarketingPath("/my")).toBe(false);
    expect(isMarketingPath("/c/some-public-id")).toBe(false);
    expect(isMarketingPath("/insurer")).toBe(false);
  });

  it("似た名前の別セグメントを誤って前方一致させない（/for-shops-x 等）", () => {
    expect(isMarketingPath("/for-shops-extra")).toBe(false);
    expect(isMarketingPath("/pricing2")).toBe(false);
  });

  it("MARKETING_ROUTE_SEGMENTS が src/app/(marketing) の実ディレクトリと一致する（ドリフト検出）", () => {
    const marketingDir = join(process.cwd(), "src", "app", "(marketing)");
    const onDisk = readdirSync(marketingDir)
      .filter((name) => statSync(join(marketingDir, name)).isDirectory())
      .filter((name) => !name.startsWith("_") && !name.startsWith("."))
      .map((name) => `/${name}`)
      .sort();
    const registered = [...MARKETING_ROUTE_SEGMENTS].sort();

    const missing = onDisk.filter((p) => !registered.includes(p));
    expect(missing, `MARKETING_ROUTE_SEGMENTS に未登録: ${missing.join(", ")}`).toEqual([]);

    const stale = registered.filter((p) => !onDisk.includes(p));
    expect(stale, `MARKETING_ROUTE_SEGMENTS に実体の無いセグメント: ${stale.join(", ")}`).toEqual([]);
  });
});
