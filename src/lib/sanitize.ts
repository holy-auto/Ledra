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
 * Escape a value for use inside a PostgREST `.or()` / `.filter()` string.
 * PostgREST uses commas to separate conditions and dots/parens as syntax.
 * After ILIKE-escaping, we also strip characters that could break the
 * filter DSL or enable injection.
 *
 * Stripped characters:
 *   `,` — condition separator
 *   `(` `)` — grouping / function call syntax
 *   `.` — column/operator separator
 *   `;` — potential query separator
 *   `"` `'` — quoting that could break out of value context
 *   `:` — type cast separator
 *
 * Use this on user-supplied values that are interpolated into `.or()` strings.
 */
export function escapePostgrestValue(str: string): string {
  // eslint-disable-next-line no-useless-escape
  return str.replace(/[,(). ;:"'`:]/g, "");
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
