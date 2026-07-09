/**
 * Shared result types for authenticity verification providers.
 *
 * Each provider returns a small, serialisable result object.
 * Phase 3a ships with "Disabled" stubs that return safe defaults;
 * real implementations are wired in Phase 3b–3e.
 */

/* ── C2PA signing ──────────────────────────────────────────────── */

export interface C2paResult {
  /** IPFS CID of the signed C2PA manifest, or null if not signed. */
  manifestCid: string | null;
  /** Whether the manifest was validated after signing. */
  verified: boolean;
  /** Image buffer with C2PA manifest embedded, or null if not signed. */
  signedBuffer: Buffer | null;
}

/* ── Deepfake detection ────────────────────────────────────────── */

export type DeepfakeVerdict = "likely_real" | "suspicious" | "likely_fake";

export interface DeepfakeResult {
  /** Provider confidence score (0.0000–1.0000), null if not evaluated. */
  score: number | null;
  /** Human-readable verdict, null if not evaluated. */
  verdict: DeepfakeVerdict | null;
}

/* ── Device attestation ────────────────────────────────────────── */

export type DeviceAttestationProvider = "play_integrity" | "app_attest" | "none";

export interface DeviceAttestationResult {
  provider: DeviceAttestationProvider;
  verified: boolean;
  /**
   * Stable hash of the attested device key (App Attest: SHA-256 of the attested
   * public key). Recorded on the consumed capture nonce for replay/farm
   * detection. `null` for providers that expose no device key (Play Integrity).
   */
  deviceKeyHash?: string | null;
  /** Short machine reason when `verified` is false (audit / capture_binding_reason). */
  reason?: string | null;
}

/* ── Polygon anchoring ─────────────────────────────────────────── */

export type PolygonNetwork = "polygon" | "amoy";

export interface PolygonAnchorResult {
  /** Transaction hash on Polygon, null if not anchored. */
  txHash: string | null;
  anchored: boolean;
  /** Which network the tx was submitted to (for building explorer links). */
  network: PolygonNetwork | null;
}

/* ── Aggregate bundle returned by invokeAllUploadProviders ─────── */

export interface UploadProviderBundle {
  c2pa: C2paResult;
  deepfake: DeepfakeResult;
  polygon: PolygonAnchorResult;
}
