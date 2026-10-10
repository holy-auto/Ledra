import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SHOP_INDUSTRIES } from "../shopIndustries";
import { getGlossaryTerm } from "../glossary";

describe("業態別の入口ページ データ整合性", () => {
  it("slug は一意で URL 安全", () => {
    const slugs = SHOP_INDUSTRIES.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("機能カードのリンク先は実在するマーケティングページ（内部リンク切れ防止）", () => {
    const marketingDir = join(process.cwd(), "src", "app", "(marketing)");
    for (const i of SHOP_INDUSTRIES) {
      for (const f of i.features) {
        if (!f.href) continue;
        const glossary = f.href.match(/^\/glossary\/(.+)$/);
        if (glossary) {
          expect(getGlossaryTerm(glossary[1]), `${i.slug} → ${f.href}`).toBeDefined();
        } else {
          expect(existsSync(join(marketingDir, f.href, "page.tsx")), `${i.slug} → ${f.href}`).toBe(true);
        }
      }
    }
  });

  it("関連用語は用語集に実在する", () => {
    for (const i of SHOP_INDUSTRIES) {
      for (const g of i.glossary) expect(getGlossaryTerm(g), `${i.slug} → ${g}`).toBeDefined();
    }
  });
});
