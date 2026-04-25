/**
 * Locale negotiation from a Request — Accept-Language header parsing.
 *
 * We deliberately do NOT use the cookie / URL segment approach here because
 * Ledra does not yet route by locale. This helper is for handlers that want
 * to localize *responses* (e.g. error JSON) based on the client's preference
 * without changing routing.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale, isSupportedLocale } from "./locales";

/**
 * Parse Accept-Language and return the best-matching supported locale, or
 * DEFAULT_LOCALE if none match.
 *
 * Uses a simple q-value sort. Works with `Request | NextRequest | Headers`.
 */
export function negotiateLocale(input: { headers: Headers } | Headers): Locale {
  const headers = input instanceof Headers ? input : input.headers;
  const header = headers.get("accept-language");
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((entry) => {
      const [tag, ...rest] = entry.trim().split(";");
      const qPart = rest.find((p) => p.trim().startsWith("q="));
      const q = qPart ? Number(qPart.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((e) => e.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // Direct match (e.g. "ja", "en")
    if (isSupportedLocale(tag)) return tag;
    // Language-only prefix (e.g. "ja-JP" → "ja", "en-US" → "en")
    const primary = tag.split("-")[0];
    if (isSupportedLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale };
