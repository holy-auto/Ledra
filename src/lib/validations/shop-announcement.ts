import { z } from "zod";

/**
 * 店舗お知らせ (shop_announcements) の入力バリデーション。
 * 原文 (日本語) のみ受け取り、翻訳はサーバ側で自動付与する。
 */
export const shopAnnouncementCreateSchema = z.object({
  title: z.string().trim().min(1, "タイトルは必須です。").max(200),
  body: z.string().trim().min(1, "本文は必須です。").max(5000),
  published: z.boolean().optional().default(false),
});

export const shopAnnouncementUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  published: z.boolean().optional(),
});

export const shopAnnouncementDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

export type ShopAnnouncementCreate = z.infer<typeof shopAnnouncementCreateSchema>;
export type ShopAnnouncementUpdate = z.infer<typeof shopAnnouncementUpdateSchema>;
