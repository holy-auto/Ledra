/**
 * C2PA content-provenance signing provider.
 *
 * Env: `C2PA_MODE` = "disabled" | "dev-signed" | "production"
 *      `PINATA_JWT` = Pinata JWT for IPFS pinning (optional)
 * Default: "disabled"
 *
 * - `disabled`: no-op, returns unsigned defaults.
 * - `dev-signed`: signs with an ephemeral self-signed ES256 cert (zero config).
 * - `production`: signs with cert/key from C2PA_SIGNER_CERT / C2PA_SIGNER_KEY env vars.
 *
 * The native @contentauth/c2pa-node module is loaded dynamically so a
 * binding failure on an unsupported platform falls back gracefully.
 */

import type { C2paResult } from "./types";

export type C2paMode = "disabled" | "dev-signed" | "production";

function getMode(): C2paMode {
  const raw = process.env.C2PA_MODE;
  if (raw === "dev-signed" || raw === "production") return raw;
  return "disabled";
}

const DISABLED_RESULT: C2paResult = {
  manifestCid: null,
  verified: false,
  signedBuffer: null,
};

/**
 * Pin a buffer to IPFS via Pinata and return its CID.
 * Returns null on failure (non-blocking).
 */
async function pinToPinata(signedBuffer: Buffer): Promise<string | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;

  try {
    const blob = new Blob([new Uint8Array(signedBuffer)]);
    const form = new FormData();
    form.append("file", blob, "c2pa-manifest.bin");
    form.append("pinataMetadata", JSON.stringify({ name: `ledra-c2pa-${Date.now()}` }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    if (!res.ok) {
      console.error(`[c2pa] Pinata returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const cid: string | undefined = json?.IpfsHash;
    if (!cid) {
      console.error("[c2pa] Pinata response missing IpfsHash");
      return null;
    }

    return cid;
  } catch (err) {
    console.error("[c2pa] IPFS pinning failed", err);
    return null;
  }
}

/**
 * Capture-binding payload sealed into the manifest so a signed photo cannot be
 * silently moved to a different certificate/vehicle or replayed for another
 * capture. All fields optional — only the ones present are asserted.
 */
export interface CaptureBinding {
  /** Certificate public_id this photo belongs to. */
  publicId?: string | null;
  /** Vehicle VIN the certificate is for. */
  vin?: string | null;
  /** Server-issued single-use capture nonce. */
  captureNonce?: string | null;
  /** RFC3161 TSA genTime over the capture hash, if a TSA seal was obtained. */
  tsaTimestamp?: string | null;
}

/**
 * Sign an image buffer with a C2PA manifest.
 *
 * On success the returned `signedBuffer` contains the image with the
 * manifest embedded.  The caller should upload this buffer to storage
 * instead of the original.
 *
 * `binding` seals certificate/vehicle/nonce/time into a custom assertion.
 */
export async function signC2pa(buffer: Buffer, mime: string, binding?: CaptureBinding): Promise<C2paResult> {
  const mode = getMode();
  if (mode === "disabled") return DISABLED_RESULT;

  try {
    const { createC2paSigner } = await import("./c2paSigner");
    const signer = await createC2paSigner(mode);
    if (!signer) return DISABLED_RESULT;

    const { Builder } = await import("@contentauth/c2pa-node");

    // Use the static factory, NOT `new Builder({...})`. The Builder constructor
    // takes a native NeonBuilder handle; passing a manifest-definition object
    // makes every subsequent native call (addAssertion/sign) throw
    // "failed to downcast any to JsBox<NeonBuilder>". `withJson` allocates the
    // native builder and seeds it with the manifest definition.
    const builder = Builder.withJson({
      claim_generator_info: [{ name: "Ledra", version: "1.0" }],
      title: "Certificate Photo",
    });

    // Record the real provenance, not a bare `c2pa.created`. Ledra is not the
    // capture device: by the time we sign, the upload pipeline
    // (imageExif.stripGpsAndReadExif) has opened the device-captured photo,
    // baked in its orientation, re-encoded it, and removed ALL EXIF/GPS
    // metadata. Declaring only `c2pa.created` would misrepresent that history
    // to any C2PA validator — and silently drop the fact that location data
    // was stripped. Assert the actual sequence instead, including the metadata
    // removal, so the manifest is an honest ledger of what happened.
    //
    // ponytail: unconditional — signC2pa doesn't know whether the strip/re-encode
    // actually ran (it receives the post-strip buffer). In the rare fallback where
    // sharp failed and the original buffer was signed as-is, `c2pa.converted`/
    // the removal action slightly over-claim. Upgrade path: thread the transform
    // outcome from the upload route through invokeAllUploadProviders → signC2pa.
    builder.addAssertion("c2pa.actions", {
      actions: [
        { action: "c2pa.opened", softwareAgent: "Ledra/1.0" },
        { action: "c2pa.orientation", softwareAgent: "sharp" },
        { action: "c2pa.converted", softwareAgent: "sharp" },
        // EXIF/GPS metadata removed for privacy before signing.
        { action: "c2pa.edited", parameters: { name: "exif_gps_metadata_removed" } },
      ],
    });

    // Seal the capture context into the manifest: which certificate/vehicle this
    // photo is for, the single-use capture nonce, and the TSA time. This binds
    // the signed image to one certificate so it cannot be reused elsewhere, and
    // ties it to a nonce that only existed after that certificate was created.
    const bindingEntries = Object.entries({
      cert_public_id: binding?.publicId ?? undefined,
      vin: binding?.vin ?? undefined,
      capture_nonce: binding?.captureNonce ?? undefined,
      tsa_timestamp: binding?.tsaTimestamp ?? undefined,
    }).filter(([, v]) => v != null && v !== "");
    if (bindingEntries.length > 0) {
      builder.addAssertion("com.ledra.capture", Object.fromEntries(bindingEntries));
    }

    const input = { buffer, mimeType: mime };
    const output: { buffer: Buffer | null } = { buffer: null };

    await builder.sign(signer, input, output);

    if (!output.buffer) {
      console.error("[c2pa] signing produced no output buffer");
      return DISABLED_RESULT;
    }

    // Pin signed manifest to IPFS (non-blocking on failure)
    const manifestCid = await pinToPinata(output.buffer);

    return {
      manifestCid,
      verified: true,
      signedBuffer: output.buffer,
    };
  } catch (err) {
    console.error("[c2pa] signing failed, falling back to unsigned", err);
    return DISABLED_RESULT;
  }
}
