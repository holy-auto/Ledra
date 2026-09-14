#!/usr/bin/env node
/**
 * C2PA production signing-certificate pre-deployment verifier.
 *
 * Run this BEFORE flipping C2PA_MODE=production to confirm a candidate
 * certificate actually produces a *trusted* C2PA manifest — i.e. it satisfies
 * the c2pa-rs end-entity profile AND chains to a root on the official C2PA
 * Trust List. A cert that only "signs" but does not chain to the trust list
 * makes validators report validation_state=Invalid, which is worse than not
 * signing at all (see docs/c2pa-production-deployment.md).
 *
 * What it does:
 *   1. Loads the cert chain (C2PA_SIGNER_CERT) and key (C2PA_SIGNER_KEY).
 *   2. Signs a synthetic JPEG through the SAME manifest construction Ledra uses
 *      in production (src/lib/anchoring/providers/c2pa.ts).
 *   3. Reads the manifest back with the official C2PA Trust List configured as
 *      trust anchors and verify_trust_list enabled.
 *   4. Reports GO only when validation_state === "Trusted".
 *
 * Usage:
 *   # cert/key as file paths (recommended):
 *   C2PA_SIGNER_CERT=./chain.pem C2PA_SIGNER_KEY=./key.pk8.pem \
 *     node scripts/verify-c2pa-cert.mjs
 *
 *   # or inline PEM in the env var (same as production runtime):
 *   node scripts/verify-c2pa-cert.mjs
 *
 * Flags:
 *   --trust-list=<path>  Use a local trust-list PEM instead of fetching the
 *                        official one (offline / pinned verification).
 *   --alg=<es256|es384|ps256|...>  Signing algorithm (default es256).
 *
 * Exit code: 0 = GO (trusted), 1 = NO-GO or setup error.
 *
 * Requires the optional native module @contentauth/c2pa-node to be installed.
 */

import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";

const OFFICIAL_TRUST_LIST_URL =
  "https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem";

function fail(msg) {
  console.error(`\n❌ NO-GO: ${msg}`);
  process.exit(1);
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

// Accept either an inline PEM (starts with "-----BEGIN") or a file path.
async function readPemMaybePath(value, label) {
  if (!value) fail(`${label} is not set.`);
  if (value.includes("-----BEGIN")) return value;
  if (existsSync(value)) return fs.readFile(value, "utf8");
  fail(`${label} is neither inline PEM nor an existing file path: ${value}`);
}

async function loadTrustList() {
  const localPath = arg("trust-list");
  if (localPath) {
    if (!existsSync(localPath)) fail(`--trust-list path not found: ${localPath}`);
    console.info(`• Trust list: local ${localPath}`);
    return fs.readFile(localPath, "utf8");
  }
  console.info(`• Trust list: fetching official ${OFFICIAL_TRUST_LIST_URL}`);
  const res = await fetch(OFFICIAL_TRUST_LIST_URL);
  if (!res.ok) fail(`could not fetch official trust list (HTTP ${res.status}). Pass --trust-list=<path>.`);
  return res.text();
}

async function main() {
  const alg = arg("alg") ?? "es256";

  let c2pa;
  try {
    c2pa = await import("@contentauth/c2pa-node");
  } catch (err) {
    fail(`@contentauth/c2pa-node is not installed/loadable: ${err?.message ?? err}`);
  }
  const { Builder, LocalSigner, Reader } = c2pa;

  const certPem = await readPemMaybePath(process.env.C2PA_SIGNER_CERT, "C2PA_SIGNER_CERT");
  const keyPem = await readPemMaybePath(process.env.C2PA_SIGNER_KEY, "C2PA_SIGNER_KEY");
  if (!keyPem.includes("BEGIN PRIVATE KEY")) {
    fail("C2PA_SIGNER_KEY must be PKCS#8 (-----BEGIN PRIVATE KEY-----). Convert a SEC1 EC key: openssl pkcs8 -topk8 -nocrypt -in ec.key -out pkcs8.key");
  }
  const trustPem = await loadTrustList();

  // A real JPEG so the manifest embeds into an actual container. sharp is a
  // project dependency and this script runs from the repo root.
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();

  // Mirror Ledra's production manifest construction (keep in sync with
  // src/lib/anchoring/providers/c2pa.ts — CREATED_ACTION / TRANSFORM_ACTIONS /
  // SPEC_VERSION / allActionsIncluded). This is the normal (transform-applied)
  // path: sharp re-encoded+stripped, so all four actions are asserted.
  // NOTE: c2pa.opened requires an ingredient in claim v2 and would make the
  // manifest Invalid (ingredientMismatch) even with a trusted cert — do not
  // reintroduce it here.
  const builder = Builder.withJson({
    claim_generator_info: [{ name: "Ledra", version: "1.0", specVersion: "2.4" }],
    title: "Certificate Photo",
  });
  builder.addAssertion("c2pa.actions", {
    actions: [
      {
        action: "c2pa.created",
        digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
      },
      { action: "c2pa.orientation", softwareAgent: "sharp" },
      { action: "c2pa.converted", softwareAgent: "sharp" },
      { action: "c2pa.edited", parameters: { name: "exif_gps_metadata_removed" } },
    ],
    allActionsIncluded: true,
  });
  builder.addAssertion("com.ledra.capture", { cert_public_id: "cert_preflight", vin: "PREFLIGHT00000001" });

  let signer;
  try {
    signer = LocalSigner.newSigner(Buffer.from(certPem), Buffer.from(keyPem), alg, undefined);
  } catch (err) {
    fail(`could not create signer (bad cert/key/alg): ${err?.message ?? err}`);
  }

  const output = { buffer: null };
  try {
    await builder.sign(signer, { buffer: jpeg, mimeType: "image/jpeg" }, output);
  } catch (err) {
    fail(`signing failed the c2pa-rs certificate profile check: ${err?.message ?? err}`);
  }
  if (!output.buffer) fail("signing produced no output buffer.");
  console.info(`• Signed OK (${jpeg.length} → ${output.buffer.length} bytes)`);

  // Read back WITH the official trust list configured. verify_trust_list makes
  // c2pa-rs walk the chain to a trust-list root; validation_state becomes
  // "Trusted" only when that succeeds.
  const settings = {
    verify: { verify_after_reading: true, verify_trust: true },
    trust: { verify_trust_list: true, trust_anchors: trustPem },
  };
  let parsed;
  try {
    const reader = await Reader.fromAsset({ buffer: output.buffer, mimeType: "image/jpeg" }, settings);
    const json = reader.json();
    parsed = typeof json === "string" ? JSON.parse(json) : json;
  } catch (err) {
    fail(`could not read back the signed manifest: ${err?.message ?? err}`);
  }

  const state = parsed?.validation_state ?? "unknown";
  const active = parsed?.active_manifest ?? "(none)";
  const signerName =
    parsed?.manifests?.[active]?.signature_info?.issuer ??
    parsed?.manifests?.[active]?.signature_info?.cert_serial_number ??
    "(unknown signer)";

  console.info(`• active_manifest : ${active}`);
  console.info(`• signer          : ${signerName}`);
  console.info(`• validation_state: ${state}`);

  if (state === "Trusted") {
    console.info("\n✅ GO: the certificate chains to the C2PA Trust List — safe to set C2PA_MODE=production.");
    process.exit(0);
  }
  if (state === "Valid") {
    fail('signature is Valid but NOT Trusted — the cert does not chain to the C2PA Trust List. A real trust-list CA (e.g. DigiCert / SSL.com) cert is required; a self-signed or in-house CA cert will show as Invalid to public validators.');
  }
  fail(`validation_state=${state}. See the validation_results in the manifest for the failing check.`);
}

main().catch((err) => fail(err?.stack ?? String(err)));
