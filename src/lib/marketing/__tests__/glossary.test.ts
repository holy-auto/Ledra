import { describe, it, expect } from "vitest";
import { GLOSSARY, GLOSSARY_CATEGORIES, getGlossaryTerm, listGlossaryByCategory } from "../glossary";

describe("glossary データ整合性", () => {
  const slugs = new Set(GLOSSARY.map((t) => t.slug));

  it("slug は一意", () => {
    expect(slugs.size).toBe(GLOSSARY.length);
  });

  it("slug は URL 安全（英小文字・数字・ハイフンのみ）", () => {
    for (const t of GLOSSARY) {
      expect(t.slug, t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("related は実在する slug を指す（内部リンク切れ防止）", () => {
    for (const t of GLOSSARY) {
      for (const r of t.related) {
        expect(slugs.has(r), `${t.slug} → 未定義の related: ${r}`).toBe(true);
      }
      // 自己参照は無意味なので禁止
      expect(t.related, t.slug).not.toContain(t.slug);
    }
  });

  it("category は定義済みのカテゴリのみ", () => {
    for (const t of GLOSSARY) {
      expect(GLOSSARY_CATEGORIES[t.category], t.slug).toBeDefined();
    }
  });

  it("seeAlso.href は内部パス（先頭スラッシュ）", () => {
    for (const t of GLOSSARY) {
      if (t.seeAlso) expect(t.seeAlso.href, t.slug).toMatch(/^\//);
    }
  });

  it("必須テキストが空でない", () => {
    for (const t of GLOSSARY) {
      expect(t.term.length, t.slug).toBeGreaterThan(0);
      expect(t.short.length, t.slug).toBeGreaterThan(0);
      expect(t.definition.length, t.slug).toBeGreaterThan(20);
    }
  });

  it("getGlossaryTerm は存在/非存在を正しく返す", () => {
    expect(getGlossaryTerm(GLOSSARY[0].slug)?.slug).toBe(GLOSSARY[0].slug);
    expect(getGlossaryTerm("does-not-exist")).toBeUndefined();
  });

  it("listGlossaryByCategory は全用語を漏れなく含む", () => {
    const grouped = listGlossaryByCategory();
    const total = grouped.reduce((n, g) => n + g.terms.length, 0);
    expect(total).toBe(GLOSSARY.length);
  });
});
