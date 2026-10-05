import "reflect-metadata"; // tsyringe(@peculiar/x509 経由・@simplewebauthn 等)が要求する Reflect polyfill。x509/simplewebauthn より前に読む。
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

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { withRetry } from "@/lib/http/withRetry";
import { tls13HttpsFetch } from "@/lib/net/tls13Fetch";
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
export async function generateDevCert(): Promise<{ certPem: string; keyPem: string }> {
  const { Crypto } = await import("@peculiar/webcrypto");
  const x509 = await import("@peculiar/x509");

  const crypto = new Crypto();
  x509.cryptoProvider.set(crypto);

  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

  // C2PA (c2pa-rs) enforces an end-entity certificate profile at *sign* time.
  // A bare digitalSignature cert is rejected with "the certificate is invalid".
  // The profile requires, at minimum:
  //   - BasicConstraints CA:FALSE
  //   - KeyUsage = digitalSignature (critical)
  //   - an ExtendedKeyUsage set (no anyExtendedKeyUsage); id-kp-emailProtection
  //     (1.3.6.1.5.5.7.3.4) is the EKU c2pa-rs accepts for document/claim signing
  //   - a Subject Key Identifier extension (RFC 5280)
  // notBefore is back-dated 60s so a just-issued cert isn't rejected on clock skew.
  const ski = await x509.SubjectKeyIdentifierExtension.create(keys.publicKey);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Ledra Dev C2PA Signer",
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.4"], false),
      ski,
      new x509.AuthorityKeyIdentifierExtension(ski.keyId),
    ],
  });

  const certPem = cert.toString("pem");

  // Export private key as PKCS#8 PEM
  const keyDer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const b64 = Buffer.from(keyDer).toString("base64");
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;

  return { certPem, keyPem };
}

/** The signing certificate (PEM chain) and PKCS#8 key for a mode. dev-signed generates one per process. */
type Credential = { certPem: string; keyPem: string };
// The promise is cached, not the value: concurrent first calls must share one dev certificate.
let cachedCredential: { mode: C2paMode; credential: Promise<Credential | null> } | null = null;

function loadCredential(mode: C2paMode): Promise<Credential | null> {
  if (cachedCredential?.mode !== mode) {
    const entry = { mode, credential: readCredential(mode) };
    cachedCredential = entry;
    // A failure is not cached: the next call reads the env (or generates) again, as before.
    const forget = () => {
      if (cachedCredential === entry) cachedCredential = null;
    };
    entry.credential.then((c) => c ?? forget(), forget);
  }
  return cachedCredential.credential;
}

async function readCredential(mode: C2paMode): Promise<Credential | null> {
  if (mode === "dev-signed") {
    const credential = await generateDevCert();
    console.info("[c2pa] generated ephemeral dev-signed ES256 certificate");
    return credential;
  }
  // production: require env vars
  const certPem = process.env.C2PA_SIGNER_CERT ?? "";
  const keyPem = process.env.C2PA_SIGNER_KEY ?? "";
  if (!certPem || !keyPem) {
    console.error("[c2pa] production mode requires C2PA_SIGNER_CERT and C2PA_SIGNER_KEY env vars");
    return null;
  }
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
    const credential = await loadCredential(mode);
    if (!credential) return null;

    // This signer never calls a TSA. Time-stamped signing is signWithTimeStamp (C2PA_TSA_URL);
    // signC2pa falls back to this one when the TSA fails.
    const signer = LocalSigner.newSigner(
      Buffer.from(credential.certPem),
      Buffer.from(credential.keyPem),
      "es256",
      undefined,
    );

    cached = { mode, signer };
    return signer;
  } catch (err) {
    console.error("[c2pa] failed to create signer", err);
    return null;
  }
}

/** How long the TSA gets before the photo is signed without a time-stamp (signC2pa has 8 s in all). */
export const C2PA_TSA_TIMEOUT_MS = 2_000;

/**
 * Sign with an RFC 3161 time-stamp from `tsaUrl` in the claim signature. Returns the signed asset,
 * or null when the TSA or the signing failed; the caller then signs without a time-stamp, so a
 * TSA outage never drops the manifest. Without a time-stamp, validators judge the signing
 * certificate at the current time, so every photo signed before the certificate expires turns
 * `signingCredential.expired`. c2pa-node 0.9.7 calls a TSA only from the async signing path, hence
 * CallbackSigner + `signAsync`.
 *
 * c2pa-rs sends the TSA request with its own HTTP client, which has no timeout (a TSA that accepts
 * and never answers kept it pending for over 100 s) and no TLS 1.3 minimum. So it is pointed at a
 * relay on 127.0.0.1 that forwards the request with `tls13HttpsFetch` (https only, TLS 1.3) and
 * gives up after C2PA_TSA_TIMEOUT_MS. The `c2pa-tsa` circuit (withRetry: 5 failures open it for 30 s)
 * makes the relay fail at once while the TSA is down, so an outage costs no wait per photo.
 * ponytail: one relay per photo. Ceiling: a listening socket per concurrent signing.
 */
export async function signWithTimeStamp(
  mode: Exclude<C2paMode, "disabled">,
  tsaUrl: string,
  builder: { signAsync(signer: unknown, input: unknown, output: { buffer: Buffer | null }): Promise<unknown> },
  input: { buffer: Buffer; mimeType: string },
): Promise<Buffer | null> {
  const relay = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", async () => {
      try {
        const r = await withRetry(
          "c2pa-tsa",
          async () => {
            const r = await tls13HttpsFetch(tsaUrl, {
              method: "POST",
              headers: { "content-type": "application/timestamp-query" },
              body: Buffer.concat(chunks),
              signal: AbortSignal.timeout(C2PA_TSA_TIMEOUT_MS),
            });
            if (!r.ok) throw Object.assign(new Error(`TSA responded ${r.status}`), { status: r.status });
            return { type: r.headers.get("content-type") ?? "", body: Buffer.from(await r.arrayBuffer()) };
          },
          { maxAttempts: 1 },
        );
        res.writeHead(200, { "content-type": r.type }).end(r.body);
      } catch (err) {
        console.warn("[c2pa] TSA request failed", err instanceof Error ? err.message : err);
        res.writeHead(504).end();
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => relay.once("error", reject).listen(0, "127.0.0.1", resolve));
    const { port } = relay.address() as AddressInfo;
    const { CallbackSigner } = await import("@contentauth/c2pa-node");
    const { createPrivateKey, sign } = await import("node:crypto");
    const credential = await loadCredential(mode);
    if (!credential) return null;
    const key = createPrivateKey(credential.keyPem);
    const certs = (credential.certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map(
      (pem) => Buffer.from(pem),
    );
    const signer = CallbackSigner.newSigner(
      { alg: "es256", certs, reserveSize: 20_000, tsaUrl: `http://127.0.0.1:${port}`, directCoseHandling: false },
      async (data: Buffer) => sign("sha256", data, { key, dsaEncoding: "ieee-p1363" }),
    );
    const output: { buffer: Buffer | null } = { buffer: null };
    await builder.signAsync(signer, input, output);
    return output.buffer;
  } catch (err) {
    console.warn("[c2pa] time-stamped signing failed; signing without a time-stamp", err);
    return null;
  } finally {
    relay.close();
    relay.closeAllConnections();
  }
}
