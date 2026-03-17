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
 * filter DSL: `,`, `(`, `)`, and `.` at the start of a token.
 *
 * Use this on user-supplied values that are interpolated into `.or()` strings.
 */
export function escapePostgrestValue(str: string): string {
  // Remove characters that are PostgREST filter syntax metacharacters
  return str.replace(/[,()]/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a well-formed UUID v4 (or any UUID shape).
 * Use as a defense-in-depth guard before interpolating IDs into query filters.
 */
export function assertUUID(value: string, label = "value"): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for ${label}: ${value}`);
  }
}
