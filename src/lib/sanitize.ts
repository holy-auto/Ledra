/**
 * Escape special characters for Supabase/PostgREST `ilike` filters.
 * Prevents pattern-injection via user-supplied search strings.
 *
 * Characters escaped: `%` (wildcard), `_` (single-char wildcard), `\` (escape char).
 */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (c) => `\\${c}`);
}
