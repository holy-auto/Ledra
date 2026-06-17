import crypto from "crypto";

/**
 * Canonical JSON + SHA-256 digest for certificate anchoring.
 *
 * The digest produced here is what gets anchored on-chain (either directly
 * via LedraCertAnchor for instant route, or as a Merkle leaf for batch route).
 *
 * Canonical form is JCS-style (RFC 8785 subset):
 *   - object keys sorted lexicographically by UTF-16 code units
 *   - no insignificant whitespace
 *   - strings normalized to Unicode NFC then JSON-escaped
 *   - numbers serialized via ECMA-262 (JSON.stringify default)
 *   - non-finite numbers, BigInt, functions, symbols are rejected
 *
 * The schema version `ledra-cert-v1` is locked. Any change to the canonical
 * shape MUST bump the schema version, otherwise past anchors stop verifying.
 */

export const CERT_SCHEMA_VERSION = "ledra-cert-v1";

const HASH_NULL = "0".repeat(64);

/** Hex SHA-256 of an arbitrary string (interpreted as UTF-8). */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Produce the canonical JSON string of `value`.
 *
 * Throws on unsupported types so we never silently anchor a malformed digest.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) {
    throw new Error("canonicalize: undefined is not representable in JSON");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalize: non-finite numbers are not allowed");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined) // omit undefined-valued keys
      .sort();
    const entries = keys.map((k) => JSON.stringify(k.normalize("NFC")) + ":" + canonicalize(obj[k]));
    return "{" + entries.join(",") + "}";
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

/**
 * Hash arbitrary JSON-like data with the same canonical form used for
 * cert digests. Used for vehicle_info / content_preset sub-fields.
 *
 * `null` and `undefined` collapse to a sentinel zero-hash so that "no data"
 * is distinguishable from "empty object" (which hashes the canonical "{}").
 */
export function hashOptionalJson(value: unknown): string {
  if (value === null || value === undefined) return HASH_NULL;
  return sha256Hex(canonicalize(value));
}

/** Combined hash for free-text + preset content, used as `content_hash`. */
export function hashContent(freeText: string | null | undefined, preset: unknown): string {
  const hasFree = freeText !== null && freeText !== undefined && freeText !== "";
  const hasPreset = preset !== null && preset !== undefined;
  if (!hasFree && !hasPreset) return HASH_NULL;
  return sha256Hex(
    canonicalize({
      free: hasFree ? freeText : null,
      preset: hasPreset ? preset : null,
    }),
  );
}

/** Coerce Date/string into ISO 8601 UTC with millisecond precision. */
function normalizeIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`normalizeIso: invalid date input: ${String(value)}`);
  }
  return date.toISOString();
}

/** Lower-case 64-char hex SHA-256 (validates length and charset). */
function normalizeImageHash(h: string): string {
  if (typeof h !== "string" || !/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error(`normalizeImageHash: malformed SHA-256 hex: ${String(h)}`);
  }
  return h.toLowerCase();
}

export interface CertificateHashInput {
  publicId: string;
  tenantId: string;
  /** Original certificate creation time (does not change on edit). */
  issuedAt: Date | string;
  /** Time this particular version was produced. */
  versionAt: Date | string;
  status: "active" | "draft" | "void";
  /** Free-form vehicle info (PII excluded by upstream sanitizer). */
  vehicleInfo: unknown;
  /** Free-form content text. */
  contentFreeText: string | null;
  /** Preset content JSON. */
  contentPreset: unknown;
  /** Expiry policy type, e.g. "months" / "date". */
  expiryType: string | null;
  /** Expiry policy value. */
  expiryValue: string | null;
  /** SHA-256 hex of each attached image (any order; sorted internally). */
  imageSha256s: string[];
}

export interface CertificateCanonical {
  schema: typeof CERT_SCHEMA_VERSION;
  public_id: string;
  tenant_id: string;
  issued_at: string;
  version_at: string;
  status: string;
  vehicle_info_hash: string;
  content_hash: string;
  /** Omitted entirely (not null) when the certificate has no expiry. */
  expiry_type?: string;
  /** Omitted entirely (not null) when the certificate has no expiry. */
  expiry_value?: string;
  /** Image SHA-256 hashes, sorted lex ascending. */
  image_sha256_set: string[];
}

/**
 * Build the canonical certificate object that hashes to `cert_digest`.
 *
 * PII fields (customer name, phone last 4, etc.) are intentionally absent
 * — the input shape does not expose them, which is the type-system guarantee
 * that the digest cannot leak personal data.
 */
export function buildCanonicalCertificate(input: CertificateHashInput): CertificateCanonical {
  const result: CertificateCanonical = {
    schema: CERT_SCHEMA_VERSION,
    public_id: input.publicId,
    tenant_id: input.tenantId,
    issued_at: normalizeIso(input.issuedAt),
    version_at: normalizeIso(input.versionAt),
    status: input.status,
    vehicle_info_hash: hashOptionalJson(input.vehicleInfo),
    content_hash: hashContent(input.contentFreeText, input.contentPreset),
    image_sha256_set: input.imageSha256s.map(normalizeImageHash).sort(),
  };
  if (input.expiryType !== null && input.expiryType !== undefined) {
    result.expiry_type = input.expiryType;
  }
  if (input.expiryValue !== null && input.expiryValue !== undefined) {
    result.expiry_value = input.expiryValue;
  }
  return result;
}

/**
 * Compute the certificate digest. Returns the canonical object, the canonical
 * string, and the hex SHA-256 — callers typically want all three (canonical
 * for storage in `certificate_anchors.canonical_json`, digest for chain
 * submission, string for debugging).
 */
export function computeCertDigest(input: CertificateHashInput): {
  canonical: CertificateCanonical;
  canonicalString: string;
  digest: string;
} {
  const canonical = buildCanonicalCertificate(input);
  const canonicalString = canonicalize(canonical);
  const digest = sha256Hex(canonicalString);
  return { canonical, canonicalString, digest };
}
