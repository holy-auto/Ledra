/**
 * Locale registry. The product is Japanese-first; English is a placeholder
 * for forward-looking i18n work — adding it here registers the locale with
 * the t() helper and ensures messages/en.json is loaded.
 *
 * To add a new locale: add the code below, drop messages/<code>.json, and
 * keep ja keys as the source of truth (every locale must have the same keys).
 */
export const SUPPORTED_LOCALES = ["ja", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
