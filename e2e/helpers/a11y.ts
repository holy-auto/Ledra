/**
 * IMP-052: axe-core WCAG AA テストヘルパー。
 *
 * @axe-core/playwright を使った WCAG 2.1 AA 準拠チェックのラッパー。
 * IMP-051 の COMPONENT_ARIA_MAP と対をなす E2E 側の検証。
 *
 * ponytail: @axe-core/playwright は devDependencies に追加が必要。
 * 未インストール時はテストが skip される設計。
 */
import type { Page } from "@playwright/test";

// ponytail: 動的 import で @axe-core/playwright の有無を吸収。
// 未インストール時は null を返し、テスト側で skip する。
let AxeBuilder: typeof import("@axe-core/playwright").default | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AxeBuilder = require("@axe-core/playwright").default;
} catch {
  // @axe-core/playwright not installed — tests will skip
}

export function isAxeAvailable(): boolean {
  return AxeBuilder !== null;
}

export interface A11yViolation {
  id: string;
  impact: string | undefined;
  description: string;
  nodes: number;
}

/**
 * axe-core で WCAG 2.1 AA 違反を検出する。
 *
 * @returns 違反のサマリー配列。空 = 全合格。
 * @throws axe-core 未インストール時
 */
export async function checkA11y(
  page: Page,
  opts?: { exclude?: string[]; include?: string },
): Promise<A11yViolation[]> {
  if (!AxeBuilder) throw new Error("@axe-core/playwright is not installed");

  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);

  if (opts?.include) {
    builder = builder.include(opts.include);
  }
  if (opts?.exclude) {
    for (const sel of opts.exclude) {
      builder = builder.exclude(sel);
    }
  }

  const results = await builder.analyze();

  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? undefined,
    description: v.description,
    nodes: v.nodes.length,
  }));
}
