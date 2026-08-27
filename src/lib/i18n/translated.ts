/**
 * original_text / translated 分離パターンの型定義(v2.0 §17、IMP-011)。
 *
 * ユーザー生成コンテンツ(UGC)の原文と翻訳を分離して保持する。
 * 原文(通常 ja)が常に正。翻訳は表示補助であり、正本性を持たない。
 *
 * 既存実装例: shop_announcements.translations (jsonb)。
 * 新規テーブルはこの型に従って設計する(既存テーブルの遡及変更はしない)。
 *
 * **翻訳先は UI ロケールと同じとは限らない。** shop_announcements は
 * `["en", "zh", "vi"]` へ翻訳しており(`ai/automation/announcementAuto.ts`、
 * 配信は `api/announcements/shop/route.ts`)、`zh` は UI ロケール6言語に
 * 入っていない。そのため翻訳先の集合を型引数にし、既定を Locale にした。
 * 既存の欄をこの型で表すときは `TranslatedFields<F, "en" | "zh" | "vi">`
 * のように実際の集合を渡す。
 *
 * ponytail: DB スキーマ変更は含まない。型定義のみ。
 * 実際のテーブル設計は各タスク(IMP-026 等)で行う。
 */
import type { Locale } from "./locales";

/** 翻訳済みフィールドセット。フィールド名は使用箇所ごとに異なる。 */
export type TranslatedFields<T extends Record<string, string>, L extends string = Locale> = {
  [K in L]?: T;
};

/** 原文 + 翻訳のペア。 */
export type WithTranslations<T extends Record<string, string>, L extends string = Locale> = {
  /** 原文のロケール(通常 "ja") */
  originalLocale: Locale;
  /** 各ロケールの翻訳 */
  translations: TranslatedFields<T, L>;
  /** 最終翻訳日時(ISO 8601) */
  translatedAt?: string;
};
