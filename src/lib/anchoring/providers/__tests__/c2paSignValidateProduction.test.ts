import { describe, it, expect, beforeAll } from "vitest";

/**
 * PRODUCTION-CERT signature check. Only runs when C2PA_SIGNER_CERT and
 * C2PA_SIGNER_KEY are set (i.e. in an environment that holds the real signing
 * credential); otherwise the whole suite is skipped.
 *
 * Purpose: the dev-signed self-signed cert reports `claimSignature.mismatch`
 * regardless of content, so it cannot confirm that Ledra's real signature is
 * valid. This suite signs one image with the production credential and asserts
 * that NO `claimSignature.*` code and NO content (action/assertion/ingredient/
 * hash) failure appears. `signingCredential.untrusted` IS allowed — Ledra's CA
 * is not on the C2PA trust list until conformance is granted, which is expected
 * and orthogonal to signature validity.
 *
 * Run it with:
 *   C2PA_MODE=production \
 *   C2PA_SIGNER_CERT="$(cat cert.pem)" C2PA_SIGNER_KEY="$(cat key.pem)" \
 *   npx vitest run src/lib/anchoring/providers/__tests__/c2paSignValidateProduction.test.ts
 */
const hasProdCert = !!(process.env.C2PA_SIGNER_CERT && process.env.C2PA_SIGNER_KEY);

// Only signingCredential.untrusted is acceptable for a not-yet-trusted CA.
// A valid signature means NO claimSignature.* code is present.
const ALLOWED = [/^signingCredential\.untrusted$/];

function collectFailureCodes(json: Record<string, unknown> | null): Set<string> {
  const acc = new Set<string>();
  const status = (json?.validation_status ?? []) as Array<{ code?: string }>;
  for (const e of status) if (e?.code) acc.add(e.code);
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.failure)) {
        for (const e of obj.failure as Array<{ code?: string }>) if (e?.code) acc.add(e.code);
      }
      for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(json?.validation_results);
  return acc;
}

describe.runIf(hasProdCert)("C2PA production-cert signature is valid", () => {
  let signed: Buffer | null = null;
  // Structural type — the package's `Reader` is not reachable via
  // `typeof import(...).Reader` under bundler resolution; describe what we call.
  type C2paReader = {
    fromAsset(input: { buffer: Buffer; mimeType: string }): Promise<{ json(): unknown } | null>;
  };
  let Reader: C2paReader;
  let nativeAvailable = true;

  beforeAll(async () => {
    process.env.C2PA_MODE = "production";
    // Only a native-module load failure is a legitimate skip. Signing runs after
    // the guard: with production credentials supplied, a signing failure means the
    // app would fail open to unsigned images, so it must FAIL this suite, not skip.
    let sharp: typeof import("sharp").default;
    try {
      sharp = (await import("sharp")).default;
      Reader = (await import("@contentauth/c2pa-node")).Reader as unknown as C2paReader;
      if (!Reader) throw new Error("c2pa-node Reader export missing");
    } catch {
      nativeAvailable = false;
      return;
    }
    const { signC2pa } = await import("../c2pa");
    const buf = await sharp({
      create: { width: 240, height: 160, channels: 3, background: { r: 20, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer();
    const res = await signC2pa(buf, "image/jpeg");
    signed = res.signedBuffer ?? null;
  }, 30_000);

  it("has no claimSignature or content failures (untrusted CA is allowed)", async (ctx) => {
    if (!nativeAvailable) {
      ctx.skip(); // native c2pa-node/sharp not loadable here — surfaced as skipped, not passed
      return;
    }
    expect(signed, "production signing produced a buffer").toBeTruthy();
    const reader = await Reader.fromAsset({ buffer: signed!, mimeType: "image/jpeg" });
    const raw = reader?.json();
    const json = typeof raw === "string" ? JSON.parse(raw) : raw;
    const codes = collectFailureCodes(json);
    const unexpected = [...codes].filter((c) => !ALLOWED.some((re) => re.test(c)));
    expect(
      unexpected,
      `unexpected validation codes (want none but signingCredential.untrusted): ${[...codes].join(", ")}`,
    ).toEqual([]);
  });
});
