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
  /** C2PA manifest signed and embedded. */
  hasC2pa: boolean;
  /**
   * Which type of C2PA signing was used.
   * `dev-signed` does NOT upgrade the grade (self-signed cert has no trust chain).
   * Only `production` C2PA counts toward the capture-time seal.
   */
  c2paKind?: C2paKind;
  /** RFC3161 TSA token present over the capture hash (an alternative capture-time seal). */
  hasTsa: boolean;
  /** Device attestation (Play Integrity / App Attest) validated. */
  deviceOk: boolean;
  /** Server-issued single-use capture nonce verified fresh and bound to this certificate. */
  nonceOk: boolean;
  /** Deepfake check passed. `null` means not evaluated. */
  deepfakeOk: boolean | null;
}

/**
 * Grade a photo by how much of the *capture-time provenance* chain it carries.
 *
 * Prevention is the guarantee: a photo reaches the "guaranteed" tiers
 * (`verified` / `premium`) only when it is cryptographically bound to a real
 * attested device, a fresh single-use server nonce for this certificate, AND a
 * capture-time seal (production C2PA or an RFC3161 TSA token). Anything short of
 * that — legacy rows, web/gallery uploads, offline captures — stays at `basic`
 * (best-effort). The AI/deepfake signal is a *second line*: it only lifts an
 * already-capture-bound photo from `verified` to `premium`; it never gates the
 * guarantee.
 */
export function computeAuthenticityGrade(flags: GradeFlags): AuthenticityGrade {
  if (!flags.hasSha256) return "unverified";
  // Capture-time seal: production C2PA (dev-signed has no trust chain) OR a TSA token.
  const productionC2pa = flags.hasC2pa && flags.c2paKind !== "dev-signed";
  const captureTimeSealOk = productionC2pa || flags.hasTsa;
  // The full prevention chain = the guarantee.
  const captureBindingOk = flags.deviceOk && flags.nonceOk && captureTimeSealOk;
  if (!captureBindingOk) return "basic";
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
