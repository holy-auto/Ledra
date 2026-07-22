import { z } from "zod";

export const SITE_CONTENT_TYPES = ["blog", "news", "event", "webinar"] as const;
export type SiteContentType = (typeof SITE_CONTENT_TYPES)[number];

export const SITE_CONTENT_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type SiteContentStatus = (typeof SITE_CONTENT_STATUSES)[number];

export const SITE_CONTENT_TYPE_LABELS: Record<SiteContentType, string> = {
  blog: "ブログ",
  news: "お知らせ",
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
    type: z.enum(SITE_CONTENT_TYPES),
    status: z.enum(SITE_CONTENT_STATUSES).default("draft"),
    slug: z
      .string()
      .trim()
      .min(1, "スラッグは必須です。")
      .max(120, "スラッグは120文字以内で入力してください。")
      .regex(slugRegex, "スラッグは半角英小文字・数字・ハイフンのみ使用可能です。"),
    title: z.string().trim().min(1, "タイトルは必須です。").max(200, "タイトルは200文字以内で入力してください。"),
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
    type: get("type"),
    status: get("status") || "draft",
    slug: get("slug"),
    title: get("title"),
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
