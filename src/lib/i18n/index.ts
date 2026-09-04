export { t, getTranslator } from "./messages";
export { negotiateLocale } from "./negotiate";
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_SPEECH_LANG,
  type Locale,
  isSupportedLocale,
} from "./locales";
export { AUTO_GLOSSARY, getGlossaryForLocale, type AutoGlossaryEntry } from "./glossary";
export type { TranslatedFields, WithTranslations } from "./translated";
export {
  findMissingTranslations,
  findPlaceholderMismatches,
  computeTranslationCoverage,
  findGlossaryGaps,
  type MissingTranslation,
  type PlaceholderMismatch,
  type TranslationCoverage,
  type GlossaryGap,
} from "./qa";
