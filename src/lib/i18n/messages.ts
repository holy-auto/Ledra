/**
 * Server-side message store + t() helper.
 *
 * Messages are loaded synchronously at module init from messages/<locale>.json
 * (small JSON, single dependency). Lookup is by dot-path (`errors.unauthorized`).
 * If a key is missing in the requested locale we fall back to the default
 * locale; if it's missing there too we return the key itself so the caller
 * sees the bad path instead of an empty string.
 *
 * Variable interpolation uses `{name}` placeholders — same syntax as next-intl
 * / ICU, so callers don't need to relearn anything if we later switch.
 */
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";

type MessageTree = { [key: string]: string | MessageTree };

const MESSAGES: Record<Locale, MessageTree> = {
  ja: jaMessages as MessageTree,
  en: enMessages as MessageTree,
};

function lookup(tree: MessageTree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as MessageTree)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Translate a key. `vars` interpolates `{name}` placeholders.
 *
 *   t("errors.unauthorized", "ja")          // → "ログインが必要です。"
 *   t("errors.missing_field", "ja", { field: "email" })
 */
export function t(key: string, locale: Locale = DEFAULT_LOCALE, vars?: Record<string, string | number>): string {
  const direct = lookup(MESSAGES[locale], key);
  if (direct !== undefined) return interpolate(direct, vars);

  if (locale !== DEFAULT_LOCALE) {
    const fallback = lookup(MESSAGES[DEFAULT_LOCALE], key);
    if (fallback !== undefined) return interpolate(fallback, vars);
  }

  // Surface the missing key so dev sees it rather than getting an empty string.
  return key;
}

/**
 * Returns a curried t() bound to the given locale. Convenient for handlers
 * that resolve the locale once at the entry point.
 */
export function getTranslator(locale: Locale = DEFAULT_LOCALE) {
  return (key: string, vars?: Record<string, string | number>) => t(key, locale, vars);
}
