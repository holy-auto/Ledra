/**
 * Lazy-singleton C2PA signer factory.
 *
 * - `dev-signed`: generates an ephemeral ES256 self-signed cert in-memory
 *   (zero config, no env vars needed). The cert is cached for the process lifetime.
 * - `production`: loads cert + key from C2PA_SIGNER_CERT / C2PA_SIGNER_KEY env vars.
 *
 * The native `@contentauth/c2pa-node` module is loaded via dynamic import
 * so a binding failure on an unsupported platform never crashes the process.
 */

import type { C2paMode } from "./c2pa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LocalSignerInstance = any;

interface CachedSigner {
  mode: C2paMode;
  signer: LocalSignerInstance;
}

let cached: CachedSigner | null = null;

/**
 * Generate a self-signed ES256 (P-256) certificate + private key in PEM format.
 * Uses @peculiar/x509 + @peculiar/webcrypto (pure JS, no native deps).
 */
async function generateDevCert(): Promise<{ certPem: string; keyPem: string }> {
  const { Crypto } = await import("@peculiar/webcrypto");
  const x509 = await import("@peculiar/x509");

  const crypto = new Crypto();
  x509.cryptoProvider.set(crypto);

  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Ledra Dev C2PA Signer",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true)],
  });

  const certPem = cert.toString("pem");

  // Export private key as PKCS#8 PEM
  const keyDer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const b64 = Buffer.from(keyDer).toString("base64");
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;

  return { certPem, keyPem };
}

/**
 * Create (or return cached) a c2pa-node LocalSigner for the given mode.
 * Returns null if the signer cannot be created (missing env vars, load failure, etc).
 */
export async function createC2paSigner(mode: C2paMode): Promise<LocalSignerInstance | null> {
  if (mode === "disabled") return null;

  // Return cached signer if mode matches
  if (cached && cached.mode === mode) return cached.signer;

  try {
    const { LocalSigner } = await import("@contentauth/c2pa-node");

    let certPem: string;
    let keyPem: string;

    if (mode === "dev-signed") {
      const devCert = await generateDevCert();
      certPem = devCert.certPem;
      keyPem = devCert.keyPem;
      console.info("[c2pa] generated ephemeral dev-signed ES256 certificate");
    } else {
      // production: require env vars
      certPem = process.env.C2PA_SIGNER_CERT ?? "";
      keyPem = process.env.C2PA_SIGNER_KEY ?? "";
      if (!certPem || !keyPem) {
        console.error("[c2pa] production mode requires C2PA_SIGNER_CERT and C2PA_SIGNER_KEY env vars");
        return null;
      }
    }

    // Do NOT wire the photo TSA into the C2PA signer: a slow/unreachable TSA
    // during `builder.sign` would make signing throw and drop the whole manifest,
    // coupling fail-open photo timestamping to C2PA availability. The capture-time
    // seal is provided independently by the standalone RFC3161 token stored in
    // certificate_images.tsa_token (see photoTsa.requestPhotoTimestamp), which
    // already satisfies captureTimeSealOk. Keep C2PA signing self-contained.
    const signer = LocalSigner.newSigner(Buffer.from(certPem), Buffer.from(keyPem), "es256", undefined);

    cached = { mode, signer };
    return signer;
  } catch (err) {
    console.error("[c2pa] failed to create signer", err);
    return null;
  }
}
