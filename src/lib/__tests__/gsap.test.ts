import { describe, it, expect } from "vitest";

// このテストのねらい: src/lib/gsap.ts の全プラグイン subpath import が解決でき
// （タイポや存在しないプラグインをビルド前に検知）、registerPlugin が
// 非ブラウザ環境でも throw しないこと（SSR 安全性）を保証する。
describe("lib/gsap plugin registration", () => {
  // タイムアウトを既定の 5s から広げてある。src/lib/gsap.ts は 25 本のプラグイン
  // subpath を import しており、それが1つのテスト本体の中で「変換 + v8 カバレッジ
  // 計装」を通る。`vitest run` 単体では 1s 前後で終わるが、`test:coverage` の
  // 全並列実行では 5s を超えて落ちることがある（ローカルで再現、単体実行では常に通る）。
  // 検証内容は一切変えていない —— 遅いだけのものを落とさないための余裕。
  it("imports and registers without throwing, re-exporting the configured instances", async () => {
    const mod = await import("@/lib/gsap");

    // 主要な再エクスポートが存在する（少なくとも gsap 本体と useGSAP、代表的な DOM プラグイン）。
    expect(mod.gsap).toBeDefined();
    expect(typeof mod.useGSAP).toBe("function");
    for (const name of ["ScrollTrigger", "ScrollSmoother", "Flip", "SplitText", "DrawSVGPlugin"] as const) {
      expect(mod[name], `${name} should be re-exported`).toBeDefined();
    }

    // await import が解決した時点で、トップレベルの registerPlugin(...) が throw して
    // いないこと（= SSR 安全）が保証される。gsap 本体がロード済みであることも確認する。
    expect(mod.gsap.version).toMatch(/^3\./);
    expect(typeof mod.gsap.registerPlugin).toBe("function");
  }, 30_000);
});
