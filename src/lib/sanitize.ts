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
 *
 * Use this on user-supplied values that are interpolated into `.or()` strings.
 */
export function escapePostgrestValue(str: string): string {
  return str.replace(/[,()]/g, "");
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

/**
 * Sanitize AI-generated / untrusted HTML for outbound email bodies.
 * Keeps a small allowlist of formatting tags (attributes are stripped);
 * every other tag is HTML-escaped so it renders as visible text instead
 * of executing. Prompt-injected model output or malicious customer data
 * therefore cannot add tracking pixels, links, or scripts.
 *
 * ponytail: 正規表現ベースの軽量サニタイザ (属性は全除去、許可タグ以外は
 * エスケープして可視化)。リンクや画像を許可したくなったら、その時点で
 * sanitize-html 等の導入に切り替える。
 */
export function sanitizeEmailHtml(html: string): string {
  const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "b", "i", "ul", "ol", "li"]);
  return html.replace(/<[^>]*>/g, (tag) => {
    const m = tag.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)(?:[\s/][^>]*)?>$/);
    const name = m?.[2]?.toLowerCase();
    if (m && name && ALLOWED_TAGS.has(name)) {
      return `<${m[1]}${name}>`;
    }
    return escapeHtml(tag);
  });
}
