/**
 * Device attestation dispatcher (Play Integrity / App Attest).
 *
 * Env: `DEVICE_ATTESTATION_ENABLED` = "true" | "false" (default false)
 *
 * Verifies that a photo was captured by a genuine app on a genuine device,
 * bound to the server-issued capture nonce. Dispatches to the per-platform
 * verifier by the client-declared `provider`. Fail-closed everywhere:
 * disabled, missing token, unknown provider, or any verification failure all
 * return `verified: false` with a machine reason.
 *
 * NOTE: kept OFF until real-device tokens are validated end-to-end (Phase 3).
 * The verifiers are unit-tested at the pure-helper level; the App Attest chain
 * requires operator-supplied APP_ATTEST_ROOT_CA_PEM (egress blocks fetching it).
 */

import type { DeviceAttestationProvider, DeviceAttestationResult } from "./types";
import { verifyPlayIntegrity } from "./playIntegrity";
import { verifyAppAttest } from "./appAttest";

function isEnabled(): boolean {
  return process.env.DEVICE_ATTESTATION_ENABLED === "true";
}

const disabled = (reason: string): DeviceAttestationResult => ({
  provider: "none",
  verified: false,
  deviceKeyHash: null,
  reason,
});

/**
 * Verify a device attestation token from the client.
 *
 * @param token       The attestation token/envelope sent by the mobile client.
 * @param opts.provider     Client-declared platform ("play_integrity" | "app_attest").
 * @param opts.expectedNonce Server-issued capture nonce the token must be bound to.
 */
export async function verifyDeviceAttestation(
  token?: string,
  opts?: { provider?: string | null; expectedNonce?: string | null },
): Promise<DeviceAttestationResult> {
  if (!isEnabled()) return disabled("attestation_disabled");
  if (!token) return disabled("missing_token");

  const provider = opts?.provider;
  const expectedNonce = opts?.expectedNonce ?? null;

  if (provider === "play_integrity") {
    const r = await verifyPlayIntegrity(token, expectedNonce);
    return { provider: "play_integrity", verified: r.verified, deviceKeyHash: null, reason: r.reason };
  }
  if (provider === "app_attest") {
    const r = await verifyAppAttest(token, expectedNonce);
    return { provider: "app_attest", verified: r.verified, deviceKeyHash: r.deviceKeyHash, reason: r.reason };
  }
  return disabled("unknown_provider");
}

/** Narrow a client-declared provider string to the known enum (else "none"). */
export function normalizeAttestationProvider(raw: string | null | undefined): DeviceAttestationProvider {
  return raw === "play_integrity" || raw === "app_attest" ? raw : "none";
}
