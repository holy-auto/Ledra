/**
 * Shared result types for authenticity verification providers.
 *
 * Each provider returns a small, serialisable result object.
 * Phase 3a ships with "Disabled" stubs that return safe defaults;
 * real implementations are wired in Phase 3b–3e.
 */

/* ── C2PA signing ──────────────────────────────────────────────── */

/**
 * 署名時に確定するC2PAマニフェストの要約。読み戻し(Reader API)を必要とせず、
 * こちらが封入した内容から決定的に組み立てられる範囲だけを DB に保存・表示する。
 * 単回nonceの生値は残さない（封入したか否かの真偽のみ）。
 */
export interface C2paManifestSummary {
  /** claim_generator（署名アプリの識別子）。 */
  claimGenerator: string;
  /** マニフェストのタイトル。 */
  title: string;
  /** 署名モード（署名者の種別）。 */
  signerMode: "dev-signed" | "production";
  /** claim_generator_info.specVersion（表明した C2PA Spec バージョン）。 */
  specVersion: string;
  /** c2pa.actions の allActionsIncluded（行為台帳が完全かどうか）。 */
  allActionsIncluded: boolean;
  /** c2pa.actions 台帳（要約した action 名の配列）。 */
  actions: string[];
  /** com.ledra.capture に封入した束縛の要約。 */
  binding: {
    certPublicId: string | null;
    vin: string | null;
    tsaTimestamp: string | null;
    /** 単回撮影nonceを封入したか（生値は残さない）。 */
    nonceSealed: boolean;
  };
}

export interface C2paResult {
  /** IPFS CID of the signed C2PA manifest, or null if not signed. */
  manifestCid: string | null;
  /** Whether the manifest was validated after signing. */
  verified: boolean;
  /** Image buffer with C2PA manifest embedded, or null if not signed. */
  signedBuffer: Buffer | null;
  /** 署名したマニフェストの要約（未署名なら null）。DB `certificate_images.c2pa_manifest` に保存。 */
  manifestSummary: C2paManifestSummary | null;
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
