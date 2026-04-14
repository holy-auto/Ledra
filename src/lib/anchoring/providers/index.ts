/**
 * Orchestrates all upload-time verification providers.
 *
 * Uses Promise.allSettled so a single provider failure never blocks
 * the upload or causes other providers to be skipped.
 */

import { signC2pa } from "./c2pa";
import { checkDeepfake } from "./deepfake";
import { verifyDeviceAttestation } from "./deviceAttestation";
import { anchorToPolygon, verifyAnchor, buildExplorerUrl, findAnchorTx } from "./polygon";
import type { UploadProviderBundle } from "./types";

// Re-export in a single statement — a combined `import … from "./polygon"`
// plus `export … from "./polygon"` trips Turbopack (sees the named import
// as already-resolved and then fails to re-resolve the same symbol on the
// re-export line). Splitting the re-exports from the value-imports keeps
// both the webpack and Turbopack bundlers happy.
export { anchorToPolygon, verifyAnchor, buildExplorerUrl, findAnchorTx };

/**
 * Run all verification providers in parallel.
 *
 * Every provider is gated by its own env var; when disabled it returns
 * a no-op result immediately.  Failures are caught per-provider so
 * one broken integration never blocks an upload.
 */
export async function invokeAllUploadProviders(
  buffer: Buffer,
  mime: string,
  sha256: string,
  deviceToken?: string,
): Promise<UploadProviderBundle> {
  const [c2pa, deepfake, deviceAttestation, polygon] = await Promise.allSettled([
    signC2pa(buffer, mime),
    checkDeepfake(buffer),
    verifyDeviceAttestation(deviceToken),
    anchorToPolygon(sha256),
  ]);

  return {
    c2pa: c2pa.status === "fulfilled" ? c2pa.value : { manifestCid: null, verified: false, signedBuffer: null },
    deepfake: deepfake.status === "fulfilled" ? deepfake.value : { score: null, verdict: null },
    deviceAttestation:
      deviceAttestation.status === "fulfilled"
        ? deviceAttestation.value
        : { provider: "none" as const, verified: false },
    polygon: polygon.status === "fulfilled" ? polygon.value : { txHash: null, anchored: false, network: null },
  };
}

export type { UploadProviderBundle } from "./types";
export type { C2paResult, DeepfakeResult, DeviceAttestationResult, PolygonAnchorResult, PolygonNetwork } from "./types";
