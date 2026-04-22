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

// Hard per-provider cap. Without this, a slow blockchain RPC or deepfake
// API call can push the upload past Vercel's function timeout and surface
// as a generic "アップロードに失敗しました" error to the client.
const PROVIDER_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[providers] ${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`);
      resolve(fallback);
    }, PROVIDER_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => {
        clearTimeout(timer);
        console.warn(`[providers] ${label} threw`, err instanceof Error ? err.message : err);
        resolve(fallback);
      },
    );
  });
}

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
  const [c2pa, deepfake, deviceAttestation, polygon] = await Promise.all([
    withTimeout(signC2pa(buffer, mime), { manifestCid: null, verified: false, signedBuffer: null }, "c2pa"),
    withTimeout(checkDeepfake(buffer), { score: null, verdict: null }, "deepfake"),
    withTimeout(verifyDeviceAttestation(deviceToken), { provider: "none" as const, verified: false }, "deviceAttestation"),
    withTimeout(anchorToPolygon(sha256), { txHash: null, anchored: false, network: null }, "polygon"),
  ]);

  return { c2pa, deepfake, deviceAttestation, polygon };
}

export type { UploadProviderBundle } from "./types";
export type { C2paResult, DeepfakeResult, DeviceAttestationResult, PolygonAnchorResult, PolygonNetwork } from "./types";
