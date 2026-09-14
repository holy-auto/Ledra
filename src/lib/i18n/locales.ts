/**
 * Locale registry — v2.0 §17.1 の初期重点 6 言語(IMP-011)。
 * Japanese-first。他ロケールのメッセージが欠落した場合は ja にフォールバック。
 *
 * To add a new locale: add the code below, drop messages/<code>.json, and
 * keep ja keys as the source of truth (every locale must have the same keys).
 */
export const SUPPORTED_LOCALES = ["ja", "en", "vi", "id", "fil", "hi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

/** 言語選択 UI 用の表示名。IMP-012(オンボーディング)が参照する。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  fil: "Filipino",
  hi: "हिन्दी",
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Locale → BCP 47 音声認識タグ。Web Speech API の `lang` に渡す。
 * ponytail: 国名サフィックスは最多話者の国。必要になったら地域切替を追加。
 */
export const LOCALE_SPEECH_LANG: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
  vi: "vi-VN",
  id: "id-ID",
  fil: "fil-PH",
  hi: "hi-IN",
};
