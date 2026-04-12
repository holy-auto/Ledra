/**
 * Authenticity grade for certificate images.
 *
 * Grades progress from `unverified` (legacy data) up to `premium`
 * (full C2PA + device attestation + deepfake verification). Phase 1
 * only reaches `basic`; the higher tiers are wired up but unused until
 * the corresponding verification providers are integrated in Phase 3.
 *
 * See plans/snoopy-inventing-tulip.md §23 for the full design.
 */

export type AuthenticityGrade = "unverified" | "basic" | "verified" | "premium";

export type C2paKind = "dev-signed" | "production" | "none";

export interface GradeFlags {
  /** SHA-256 hash computed server-side. */
  hasSha256: boolean;
  /** EXIF metadata parsed and GPS stripped. */
  hasExif: boolean;
  /** C2PA manifest signed and embedded. */
  hasC2pa: boolean;
  /**
   * Which type of C2PA signing was used.
   * `dev-signed` does NOT upgrade the grade (self-signed cert has no trust chain).
   * Only `production` C2PA counts toward `verified` / `premium`.
   */
  c2paKind?: C2paKind;
  /** Play Integrity / App Attest token validated. */
  deviceOk: boolean;
  /** Deepfake check passed. `null` means not evaluated. */
  deepfakeOk: boolean | null;
}

export function computeAuthenticityGrade(flags: GradeFlags): AuthenticityGrade {
  if (!flags.hasSha256) return "unverified";
  // dev-signed C2PA has no trust chain → does not upgrade grade
  const effectiveC2pa = flags.hasC2pa && flags.c2paKind !== "dev-signed";
  if (!effectiveC2pa) return "basic";
  if (!flags.deviceOk) return "basic";
  if (flags.deepfakeOk === true) return "premium";
  return "verified";
}

/**
 * Ordering helper so callers can pick the "highest" grade among a set
 * of images (used by the public page to show the strongest guarantee).
 */
const GRADE_RANK: Record<AuthenticityGrade, number> = {
  unverified: 0,
  basic: 1,
  verified: 2,
  premium: 3,
};

export function highestGrade(grades: ReadonlyArray<AuthenticityGrade | null | undefined>): AuthenticityGrade {
  let best: AuthenticityGrade = "unverified";
  for (const g of grades) {
    if (!g) continue;
    if (GRADE_RANK[g] > GRADE_RANK[best]) best = g;
  }
  return best;
}
