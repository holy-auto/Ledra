import { describe, expect, it } from "vitest";
import {
  ExternalPostError,
  buildExternalPostFile,
  categoryOptions,
  externalFileSlug,
  isExternalSite,
  type ExternalPostInput,
} from "../externalSites";

const base: ExternalPostInput = {
  site: "holy-inc",
  type: "news",
  slug: "new-office",
  title: "新しい拠点を開設しました",
  titleEn: "Opened a new office",
  category: "会社",
  excerpt: null,
  body: "",
  // 2026-09-15T00:30Z = JST 9:30 → 2026-09-15
  publishedAt: "2026-09-15T00:30:00.000Z",
};

describe("buildExternalPostFile — holy-inc", () => {
  it("相手のパーサが要求する5項目を揃えた frontmatter を作る", () => {
    const file = buildExternalPostFile(base);
    expect(file.path).toBe("src/content/news/2026-09-new-office.md");
    expect(file.content).toBe(
      [
        "---",
        'date: "2026-09-15"',
        'category: "会社"',
        'categoryEn: "Company"',
        'title: "新しい拠点を開設しました"',
        'titleEn: "Opened a new office"',
        "---",
        "",
      ].join("\n"),
    );
    // 本文が無い記事はページを作らないので、リンク先は一覧
    expect(file.url).toBe("https://holy-inc.jp/news");
  });

  it("本文があれば frontmatter の後ろに続け、記事ページのURLを返す", () => {
    const file = buildExternalPostFile({ ...base, body: "1段落目。\n\n2段落目。" });
    expect(file.content.endsWith("---\n\n1段落目。\n\n2段落目。\n")).toBe(true);
    expect(file.url).toBe("https://holy-inc.jp/news/2026-09-new-office");
  });

  it("英語タイトルが無ければ公開させない（英語サイトが壊れるため）", () => {
    expect(() => buildExternalPostFile({ ...base, titleEn: null })).toThrow(ExternalPostError);
  });

  it("既存4分類以外は受け付けない（勝手な英訳を作らない）", () => {
    expect(() => buildExternalPostFile({ ...base, category: "その他" })).toThrow(/会社 \/ サービス/);
  });
});

describe("buildExternalPostFile — MobileWash", () => {
  const mw: ExternalPostInput = {
    ...base,
    site: "mobilewash",
    titleEn: null,
    category: "お知らせ",
    excerpt: "出張洗車の受付を開始しました。",
  };

  it("news は category 付き、press は category 無しで書く", () => {
    const news = buildExternalPostFile(mw);
    expect(news.path).toBe("src/content/news/2026-09-new-office.md");
    expect(news.content).toContain('category: "お知らせ"');
    expect(news.content).toContain('description: "出張洗車の受付を開始しました。"');

    const press = buildExternalPostFile({ ...mw, type: "press", category: null });
    expect(press.path).toBe("src/content/press/2026-09-new-office.md");
    expect(press.content).not.toContain("category:");
  });

  it("抜粋が無ければ公開させない（一覧に出す本文が無くなる）", () => {
    expect(() => buildExternalPostFile({ ...mw, excerpt: null })).toThrow(ExternalPostError);
  });

  it("本文を書いていたら止める（MobileWash に記事ページは無く、黙って消えるため）", () => {
    expect(() => buildExternalPostFile({ ...mw, body: "長い本文" })).toThrow(/記事ごとのページがありません/);
  });

  it("holy-inc に無い種別は弾く", () => {
    expect(() => buildExternalPostFile({ ...base, type: "press" })).toThrow(/ページがありません/);
  });
});

describe("frontmatter の引用符", () => {
  it('「"」を含むタイトルはシングルクォートで囲む', () => {
    const file = buildExternalPostFile({ ...base, title: '「"Ledra"」を公開' });
    expect(file.content).toContain(`title: '「"Ledra"」を公開'`);
  });

  it("両方の引用符が入っていたら直してもらう（黙って書き換えない）", () => {
    expect(() => buildExternalPostFile({ ...base, title: `"a" 'b'` })).toThrow(ExternalPostError);
  });

  it("改行は弾く（frontmatter は1行1項目）", () => {
    expect(() => buildExternalPostFile({ ...base, title: "1行目\n2行目" })).toThrow(ExternalPostError);
  });
});

describe("公開日", () => {
  it("JST の暦日で決める（UTC 15:00 は翌日）", () => {
    const file = buildExternalPostFile({ ...base, publishedAt: "2026-09-15T15:00:00.000Z" });
    expect(file.content).toContain('date: "2026-09-16"');
    expect(file.path).toBe("src/content/news/2026-09-new-office.md");
  });

  it("公開日時が無ければ公開させない", () => {
    expect(() => buildExternalPostFile({ ...base, publishedAt: null })).toThrow(ExternalPostError);
  });
});

describe("ファイル名", () => {
  it("年月を前置し、slug が既に年月で始まっていれば二重に付けない", () => {
    expect(externalFileSlug("launch", "2026-09-15")).toBe("2026-09-launch");
    expect(externalFileSlug("2026-08-launch", "2026-09-15")).toBe("2026-09-launch");
  });
});

describe("選択肢", () => {
  it("分類が要るのは holy-inc と MobileWash の news だけ", () => {
    expect(categoryOptions("holy-inc", "news")).toHaveLength(4);
    expect(categoryOptions("mobilewash", "news")).toHaveLength(4);
    expect(categoryOptions("mobilewash", "press")).toEqual([]);
    expect(categoryOptions("ledra", "news")).toEqual([]);
  });

  it("isExternalSite は ledra だけ false", () => {
    expect(isExternalSite("ledra")).toBe(false);
    expect(isExternalSite("holy-inc")).toBe(true);
    expect(isExternalSite("mobilewash")).toBe(true);
  });
});
