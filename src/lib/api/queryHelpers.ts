/**
 * Shared query helpers for Supabase operations.
 * These reduce duplication across API routes.
 */

// Re-export the canonical escape helper from sanitize module
export { escapeIlike } from "@/lib/sanitize";

/**
 * Escape special characters for Supabase ilike queries
 * and wrap in % for fuzzy matching.
 */
export function ilikePattern(query: string): string {
  const escaped = query.replace(/[%_\\]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/**
 * Parse common list query params: page, limit, status, search query.
 */
export function parseListParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)),
  );
  const offset = (page - 1) * limit;
  const status = searchParams.get("status") || null;
  const q = (searchParams.get("q") ?? "").trim();
  return { page, limit, offset, status, q };
}
