/**
 * 外部サイト（holy-inc.jp / mobilewash.app）への投稿。
 *
 * この2サイトは静的サイトで、記事は各リポジトリの `src/content/**\/*.md` を
 * **ビルド時に**読んで一覧・プリレンダHTML・sitemap・RSS を作る。
 * そのため管理画面から公開するときは、DB に保存するだけでは足りず、
 * md ファイルを相手のリポジトリへコミットする（→ Vercel が自動デプロイ）。
 *
 * ここは「DB の1行 → 置くべきパスと md の中身」を決める純関数だけを置く。
 * 実際のコミットは `src/lib/github/contents.ts`、呼び出しは
 * `src/app/admin/site-content/actions.ts` と `publishScheduled.ts`。
 *
 * ## 相手側のパーサに合わせること
 *
 * frontmatter の書式は相手のリポジトリのパーサが決めている。緩い方に寄せると
 * 相手のビルドが落ちるので、ここで満たせない入力は例外にして公開させない。
 *
 * - holy-inc `src/lib/news-parse.ts` — date は YYYY-MM-DD、
 *   category / categoryEn / title / titleEn が必須。本文は任意（あれば記事ページができる）
 * - MobileWash `src/content/posts-parse.ts` — date は YYYY-MM か YYYY-MM-DD、
 *   title / description が必須、news は category が4種の固定値。本文は使わない
 *
 * ponytail: 相手の書式をこちらのコードに写している（同じ定義が2リポジトリにある）。
 * ズレたら相手のビルドが落ちて気づく形にしてあるが、静かにズレることは防げない。
 * 上げるなら書式を共有パッケージに切り出す。
 */
import { jstParts } from "@/lib/datetime";
import type { SiteContentSite, SiteContentType } from "@/lib/validations/site-content-post";

/** 投稿先のうち、md をリポジトリへコミットするサイト（= Ledra 以外）。 */
export const EXTERNAL_SITE_IDS = ["holy-inc", "mobilewash"] as const;
export type ExternalSiteId = (typeof EXTERNAL_SITE_IDS)[number];

export const SITE_LABELS: Record<SiteContentSite, string> = {
  ledra: "Ledra（このサイト）",
  "holy-inc": "holy-inc.jp（コーポレート）",
  mobilewash: "MobileWash（出張洗車）",
};

/** サイトごとに選べる種別。Ledra 以外は相手サイトにあるページだけ。 */
export const SITE_TYPES: Record<SiteContentSite, readonly SiteContentType[]> = {
  ledra: ["blog", "news", "event", "webinar"],
  "holy-inc": ["news"],
  mobilewash: ["news", "press"],
};

type ExternalSiteConfig = {
  owner: string;
  repo: string;
  /** 既定ブランチ。MobileWash は master、holy-inc は main。 */
  branch: string;
  siteUrl: string;
  /** 種別 → リポジトリ内のディレクトリ */
  dirs: Partial<Record<SiteContentType, string>>;
};

export const EXTERNAL_SITES: Record<ExternalSiteId, ExternalSiteConfig> = {
  "holy-inc": {
    owner: "holy-auto",
    repo: "holy-inc",
    branch: "main",
    siteUrl: "https://holy-inc.jp",
    dirs: { news: "src/content/news" },
  },
  mobilewash: {
    owner: "holy-auto",
    repo: "MobileWash",
    branch: "master",
    siteUrl: "https://mobilewash.app",
    dirs: { news: "src/content/news", press: "src/content/press" },
  },
};

export function isExternalSite(site: string): site is ExternalSiteId {
  return (EXTERNAL_SITE_IDS as readonly string[]).includes(site);
}

/**
 * holy-inc の分類（日本語 → 英語）。英語サイトにそのまま出るので、
 * 勝手な訳を作らないよう既存の4分類に閉じる。
 */
export const HOLY_INC_CATEGORIES: Record<string, string> = {
  会社: "Company",
  サービス: "Service",
  プロダクト: "Product",
  地域貢献: "Community",
};

/** MobileWash のニュース分類（相手のパーサが4値で検証している）。 */
export const MOBILEWASH_NEWS_CATEGORIES = ["お知らせ", "プレスリリース", "メディア", "採用"] as const;

/** サイト・種別に対して選べる分類。空配列なら分類そのものが要らない。 */
export function categoryOptions(site: SiteContentSite, type: SiteContentType): string[] {
  if (site === "holy-inc") return Object.keys(HOLY_INC_CATEGORIES);
  if (site === "mobilewash" && type === "news") return [...MOBILEWASH_NEWS_CATEGORIES];
  return [];
}

/** 公開できない入力。メッセージはそのまま管理画面に出す。 */
export class ExternalPostError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "ExternalPostError";
    this.field = field;
  }
}

export type ExternalPostInput = {
  site: ExternalSiteId;
  type: SiteContentType;
  slug: string;
  title: string;
  titleEn: string | null;
  category: string | null;
  excerpt: string | null;
  body: string;
  /** UTC ISO。未設定なら公開日が決まらないので例外。 */
  publishedAt: string | null;
};

export type ExternalPostFile = {
  /** リポジトリ内のパス */
  path: string;
  /** ファイルの中身 */
  content: string;
  /** 公開後に記事が出るページ */
  url: string;
};

/**
 * frontmatter の1値を引用符で囲む。
 *
 * 相手のパーサは `key: "値"` か `key: '値'` しか読まず、値の中の同じ引用符は扱えない。
 * どちらか使える方を選び、両方入っている場合は直してもらう（黙って書き換えない）。
 */
function quote(field: string, raw: string): string {
  const value = raw.trim();
  if (value.includes("\n")) {
    throw new ExternalPostError(field, "改行は入れられません（1行で書いてください）。");
  }
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new ExternalPostError(field, "「\"」と「'」の両方は使えません。どちらかを「」などに置き換えてください。");
}

function required(field: string, value: string | null | undefined, message: string): string {
  const v = (value ?? "").trim();
  if (v.length === 0) throw new ExternalPostError(field, message);
  return v;
}

/** 公開日（JST の暦日）を YYYY-MM-DD で返す。 */
function publishedDate(publishedAt: string | null): string {
  const p = jstParts(publishedAt);
  if (!p) {
    throw new ExternalPostError("published_at", "公開日時を指定してください（外部サイトの記事日付になります）。");
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/**
 * ファイル名。相手のリポジトリは「日付で始まるファイル名」が規約で、
 * MobileWash の検査は frontmatter の年月と一致することまで見る。
 * slug が既に YYYY-MM- で始まっていれば二重に付けない。
 */
export function externalFileSlug(slug: string, date: string): string {
  const bare = slug.replace(/^\d{4}-\d{2}-/, "");
  return `${date.slice(0, 7)}-${bare}`;
}

/**
 * 相手リポジトリ内のパス。公開日が無ければ null（まだ1度も公開していない）。
 * 公開・取り下げ・スラッグ変更後の後始末で、同じ導出を使う。
 */
export function externalFilePath(
  site: ExternalSiteId,
  type: SiteContentType,
  slug: string,
  publishedAt: string | null,
): string | null {
  const dir = EXTERNAL_SITES[site].dirs[type];
  const p = jstParts(publishedAt);
  if (!dir || !p) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dir}/${externalFileSlug(slug, `${p.y}-${pad(p.m)}-${pad(p.d)}`)}.md`;
}

/** DB の1行から、相手リポジトリに置く md ファイルを組み立てる。 */
export function buildExternalPostFile(input: ExternalPostInput): ExternalPostFile {
  const config = EXTERNAL_SITES[input.site];
  const dir = config.dirs[input.type];
  if (!dir) {
    throw new ExternalPostError("type", `${SITE_LABELS[input.site]} にはこの種別のページがありません。`);
  }

  const date = publishedDate(input.publishedAt);
  const title = required("title", input.title, "タイトルは必須です。");
  const fileSlug = externalFileSlug(input.slug, date);
  const path = `${dir}/${fileSlug}.md`;

  if (input.site === "holy-inc") {
    const category = required("category", input.category, "分類を選んでください。");
    const categoryEn = HOLY_INC_CATEGORIES[category];
    if (!categoryEn) {
      throw new ExternalPostError(
        "category",
        `holy-inc の分類は ${Object.keys(HOLY_INC_CATEGORIES).join(" / ")} のいずれかです。`,
      );
    }
    const titleEn = required("title_en", input.titleEn, "holy-inc は日英2言語なので、英語タイトルが必要です。");
    const body = input.body.trim();
    const frontmatter = [
      "---",
      `date: ${quote("published_at", date)}`,
      `category: ${quote("category", category)}`,
      `categoryEn: ${quote("category", categoryEn)}`,
      `title: ${quote("title", title)}`,
      `titleEn: ${quote("title_en", titleEn)}`,
      "---",
      "",
    ].join("\n");
    return {
      path,
      content: body.length > 0 ? `${frontmatter}\n${body}\n` : frontmatter,
      // 本文があるときだけ記事ページができる（無ければ一覧に見出しだけ載る）
      url: body.length > 0 ? `${config.siteUrl}/news/${fileSlug}` : `${config.siteUrl}/news`,
    };
  }

  // MobileWash
  if (input.body.trim().length > 0) {
    throw new ExternalPostError(
      "body",
      "MobileWash には記事ごとのページがありません。本文ではなく「抜粋」に1〜3文で書いてください。",
    );
  }
  const description = required("excerpt", input.excerpt, "MobileWash は一覧に出す「抜粋」が必須です。");
  const lines = ["---", `date: ${quote("published_at", date)}`];
  if (input.type === "news") {
    const category = required("category", input.category, "分類を選んでください。");
    if (!(MOBILEWASH_NEWS_CATEGORIES as readonly string[]).includes(category)) {
      throw new ExternalPostError(
        "category",
        `MobileWash の分類は ${MOBILEWASH_NEWS_CATEGORIES.join(" / ")} のいずれかです。`,
      );
    }
    lines.push(`category: ${quote("category", category)}`);
  }
  lines.push(`title: ${quote("title", title)}`, `description: ${quote("excerpt", description)}`, "---", "");

  return {
    path,
    content: lines.join("\n"),
    url: `${config.siteUrl}/company/${input.type}`,
  };
}
