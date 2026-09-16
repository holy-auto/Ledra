import { z } from "zod";
// externalSites 側の型参照は `import type` なので実行時の循環は無い。
import { SITE_TYPES, categoryOptions, isExternalSite } from "@/lib/marketing/externalSites";

export const SITE_CONTENT_TYPES = ["blog", "news", "press", "event", "webinar"] as const;
export type SiteContentType = (typeof SITE_CONTENT_TYPES)[number];

/**
 * 投稿先サイト。'ledra' は自サイト、他はグループの静的サイト。
 * 外部サイトの設定（リポジトリ・md の書式）は `src/lib/marketing/externalSites.ts`。
 * ここに置くのは、externalSites がこのファイルの型を読むため（循環を作らない）。
 */
export const SITE_CONTENT_SITES = ["ledra", "holy-inc", "mobilewash"] as const;
export type SiteContentSite = (typeof SITE_CONTENT_SITES)[number];

export const SITE_CONTENT_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type SiteContentStatus = (typeof SITE_CONTENT_STATUSES)[number];

export const SITE_CONTENT_TYPE_LABELS: Record<SiteContentType, string> = {
  blog: "ブログ",
  news: "お知らせ",
  press: "プレスリリース",
  event: "イベント",
  webinar: "ウェビナー",
};

export const SITE_CONTENT_STATUS_LABELS: Record<SiteContentStatus, string> = {
  draft: "下書き",
  scheduled: "予約",
  published: "公開中",
  archived: "アーカイブ",
};

const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const urlOrNull = z.string().trim().url("URLの形式が不正です。").max(500).nullable().optional();
// CTA のリンク先は相対パス(/poc)も絶対URLも許すため url() は使わない。
const hrefOrNull = z.string().trim().max(500, "リンクは500文字以内で入力してください。").nullable().optional();

export const siteContentPostSchema = z
  .object({
    site: z.enum(SITE_CONTENT_SITES).default("ledra"),
    type: z.enum(SITE_CONTENT_TYPES),
    status: z.enum(SITE_CONTENT_STATUSES).default("draft"),
    slug: z
      .string()
      .trim()
      .min(1, "スラッグは必須です。")
      .max(120, "スラッグは120文字以内で入力してください。")
      .regex(slugRegex, "スラッグは半角英小文字・数字・ハイフンのみ使用可能です。"),
    title: z.string().trim().min(1, "タイトルは必須です。").max(200, "タイトルは200文字以内で入力してください。"),
    // 外部サイト向け（Ledra 自身の投稿では未使用）
    title_en: z.string().trim().max(200, "英語タイトルは200文字以内で入力してください。").nullable().optional(),
    category: z.string().trim().max(40).nullable().optional(),
    excerpt: z.string().trim().max(400, "抜粋は400文字以内で入力してください。").nullable().optional(),
    body: z.string().default(""),
    hero_image_url: urlOrNull,
    tags: z.array(z.string().trim().min(1)).max(20, "タグは20個までです。").default([]),
    author: z.string().trim().max(80).nullable().optional(),
    published_at: z.string().trim().nullable().optional(),

    event_start_at: z.string().trim().nullable().optional(),
    event_end_at: z.string().trim().nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    online_url: urlOrNull,
    capacity: z.coerce.number().int().min(0).max(100000).nullable().optional(),
    registration_url: urlOrNull,

    // 記事CTA（未指定なら記事側で既定にフォールバック）
    cta_title: z.string().trim().max(200).nullable().optional(),
    cta_subtitle: z.string().trim().max(400).nullable().optional(),
    cta_primary_label: z.string().trim().max(80).nullable().optional(),
    cta_primary_href: hrefOrNull,
    cta_secondary_label: z.string().trim().max(80).nullable().optional(),
    cta_secondary_href: hrefOrNull,
    // OGP（SNS カード用。未指定なら title/excerpt を使う）
    og_title: z.string().trim().max(120).nullable().optional(),
    og_subtitle: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // 外部サイト（holy-inc / MobileWash）は相手のパーサが項目を要求する。
    // 足りないまま INSERT すると、コミットに失敗した下書きだけが残るので、
    // 保存の前に止める。下書きのままなら未入力でよい。
    if (isExternalSite(data.site)) {
      if (!SITE_TYPES[data.site].includes(data.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["type"], message: "この投稿先にはこの種別がありません。" });
      }
      if (data.status === "published" || data.status === "scheduled") {
        const categories = categoryOptions(data.site, data.type);
        if (categories.length > 0 && !categories.includes((data.category ?? "").trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["category"],
            message: `分類は ${categories.join(" / ")} のいずれかを選んでください。`,
          });
        }
        if (data.site === "holy-inc" && !(data.title_en ?? "").trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["title_en"],
            message: "holy-inc は日英2言語なので、英語タイトルが必要です。",
          });
        }
        if (data.site === "mobilewash") {
          if (!(data.excerpt ?? "").trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["excerpt"],
              message: "MobileWash は一覧に出す「抜粋」が必須です。",
            });
          }
          if ((data.body ?? "").trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["body"],
              message: "MobileWash には記事ページがありません。本文ではなく「抜粋」に書いてください。",
            });
          }
        }
      }
    }
    if (data.status === "scheduled" && (!data.published_at || Number.isNaN(Date.parse(data.published_at)))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["published_at"],
        message: "予約公開には公開日時（予約時刻）を指定してください。",
      });
    }
    if (data.type === "event" || data.type === "webinar") {
      if (!data.event_start_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["event_start_at"],
          message: "開催開始日時は必須です。",
        });
      }
      if (data.event_start_at && data.event_end_at) {
        const start = Date.parse(data.event_start_at);
        const end = Date.parse(data.event_end_at);
        if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["event_end_at"],
            message: "終了日時は開始日時より後を指定してください。",
          });
        }
      }
    }
  });

export type SiteContentPostInput = z.infer<typeof siteContentPostSchema>;

/** FormData → プレーンオブジェクト（Zod で検証する前処理） */
export function parseSiteContentFormData(fd: FormData): Record<string, unknown> {
  const get = (k: string): string => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const nullable = (k: string): string | null => {
    const v = get(k).trim();
    return v.length === 0 ? null : v;
  };
  const tagsRaw = get("tags");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const capacityRaw = get("capacity").trim();

  return {
    site: get("site") || "ledra",
    type: get("type"),
    status: get("status") || "draft",
    slug: get("slug"),
    title: get("title"),
    title_en: nullable("title_en"),
    category: nullable("category"),
    excerpt: nullable("excerpt"),
    body: get("body"),
    hero_image_url: nullable("hero_image_url"),
    tags,
    author: nullable("author"),
    published_at: nullable("published_at"),
    event_start_at: nullable("event_start_at"),
    event_end_at: nullable("event_end_at"),
    location: nullable("location"),
    online_url: nullable("online_url"),
    capacity: capacityRaw.length === 0 ? null : capacityRaw,
    registration_url: nullable("registration_url"),
    cta_title: nullable("cta_title"),
    cta_subtitle: nullable("cta_subtitle"),
    cta_primary_label: nullable("cta_primary_label"),
    cta_primary_href: nullable("cta_primary_href"),
    cta_secondary_label: nullable("cta_secondary_label"),
    cta_secondary_href: nullable("cta_secondary_href"),
    og_title: nullable("og_title"),
    og_subtitle: nullable("og_subtitle"),
  };
}
