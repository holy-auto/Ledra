/**
 * Escape special characters for Supabase/PostgREST `ilike` filters.
 * Prevents pattern-injection via user-supplied search strings.
 *
 * Characters escaped: `%` (wildcard), `_` (single-char wildcard), `\` (escape char).
 */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Escape a string for safe insertion into HTML.
 * Prevents XSS when embedding user-controlled data in HTML templates.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
