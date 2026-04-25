/**
 * Locale-aware companions to the helpers in `./response`.
 *
 * These wrap the original helpers (apiValidationError / apiUnauthorized /
 * apiForbidden / apiNotFound) and translate the message via the i18n layer
 * (`@/lib/i18n`). Existing string-based callers stay as-is — new code that
 * wants i18n uses these `*T` variants.
 *
 * Example:
 *
 *   import { apiValidationErrorT } from "@/lib/api/responseI18n";
 *
 *   if (!parsed.success) {
 *     return apiValidationErrorT(req, "errors.invalid_payload");
 *   }
 *
 * The locale is negotiated from Accept-Language; if you already resolved it
 * pass the Locale directly instead of the request.
 */
import { type Locale } from "@/lib/i18n";
import { negotiateLocale, t } from "@/lib/i18n";
import { apiValidationError, apiUnauthorized, apiForbidden, apiNotFound } from "./response";

type LocaleSource = Locale | { headers: Headers } | Headers;

function resolveLocale(source: LocaleSource): Locale {
  if (typeof source === "string") return source;
  return negotiateLocale(source);
}

type Vars = Record<string, string | number>;

export function apiValidationErrorT(source: LocaleSource, key: string, vars?: Vars, data?: Record<string, unknown>) {
  return apiValidationError(t(key, resolveLocale(source), vars), data);
}

export function apiUnauthorizedT(source: LocaleSource, key = "errors.unauthorized", vars?: Vars) {
  return apiUnauthorized(t(key, resolveLocale(source), vars));
}

export function apiForbiddenT(source: LocaleSource, key = "errors.forbidden", vars?: Vars) {
  return apiForbidden(t(key, resolveLocale(source), vars));
}

export function apiNotFoundT(source: LocaleSource, key = "errors.not_found", vars?: Vars) {
  return apiNotFound(t(key, resolveLocale(source), vars));
}
