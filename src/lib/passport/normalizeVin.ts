/**
 * Normalize a raw VIN / vehicle number for cross-tenant comparison.
 *
 * Rules (must match the SQL backfill in migration 20260424000000):
 *  1. NFKC normalize → full-width ASCII chars become half-width
 *  2. Uppercase
 *  3. Strip whitespace and hyphens
 */
export function normalizeVin(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}
