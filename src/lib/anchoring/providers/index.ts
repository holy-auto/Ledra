/**
 * Orchestrates all upload-time verification providers.
 *
 * Uses Promise.allSettled so a single provider failure never blocks
 * the upload or causes other providers to be skipped.
 */

import { signC2pa, failedC2paResult, type CaptureBinding, type TransformOutcome } from "./c2pa";
import { checkDeepfake } from "./deepfake";
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
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
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
  captureBinding?: CaptureBinding,
  transformOutcome?: TransformOutcome,
): Promise<UploadProviderBundle> {
  // Device attestation is verified once per upload request (one capture token /
  // nonce per session), not per photo — see verifyDeviceAttestation in the route.
  const [c2pa, deepfake, polygon] = await Promise.all([
    withTimeout(
      signC2pa(buffer, mime, captureBinding, transformOutcome),
      // 打ち切りも「試して得られなかった」なので failure を立てる。ここを null にすると
      // 呼び出し側から disabled と区別できず、本番で黙って未署名になる。
      // **未署名の形をここで組み直さない**（c2pa.ts と2箇所に分かれると、将来フィールドを足したとき
      // 片方だけ古い既定のまま残る —— それが今回直した欠陥そのもの。/code-review 指摘 #7）。
      failedC2paResult("timeout"),
      "c2pa",
    ),
    withTimeout(checkDeepfake(buffer), { score: null, verdict: null }, "deepfake"),
    withTimeout(anchorToPolygon(sha256), { txHash: null, anchored: false, network: null }, "polygon"),
  ]);

  return { c2pa, deepfake, polygon };
}

export type { CaptureBinding, TransformOutcome } from "./c2pa";
export type { UploadProviderBundle } from "./types";
export type {
  C2paResult,
  C2paManifestSummary,
  DeepfakeResult,
  DeviceAttestationResult,
  PolygonAnchorResult,
  PolygonNetwork,
} from "./types";
