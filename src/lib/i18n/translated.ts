/**
 * original_text / translated 分離パターンの型定義(v2.0 §17、IMP-011)。
 *
 * ユーザー生成コンテンツ(UGC)の原文と翻訳を分離して保持する。
 * 原文(通常 ja)が常に正。翻訳は表示補助であり、正本性を持たない。
 *
 * 既存実装例: shop_announcements.translations (jsonb)。
 * 新規テーブルはこの型に従って設計する(既存テーブルの遡及変更はしない)。
 *
 * ponytail: DB スキーマ変更は含まない。型定義のみ。
 * 実際のテーブル設計は各タスク(IMP-026 等)で行う。
 */
import type { Locale } from "./locales";

/** 翻訳済みフィールドセット。フィールド名は使用箇所ごとに異なる。 */
export type TranslatedFields<T extends Record<string, string>> = {
  [L in Locale]?: T;
};

/** 原文 + 翻訳のペア。 */
export type WithTranslations<T extends Record<string, string>> = {
  /** 原文のロケール(通常 "ja") */
  originalLocale: Locale;
  /** 各ロケールの翻訳 */
  translations: TranslatedFields<T>;
  /** 最終翻訳日時(ISO 8601) */
  translatedAt?: string;
};
