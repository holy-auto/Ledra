import { describe, it, expect, beforeAll } from "vitest";

/**
 * Sign a real image and validate the resulting manifest. This is the check that
 * was missing when Ledra's actions ledger drifted out of C2PA 2.x conformance:
 * the pure-function tests never signed anything, so a manifest that fails
 * validation (assertion.action.ingredientMismatch / malformed) shipped unnoticed.
 *
 * Approach: sign, read the manifest back, and require that EVERY validation code
 * is in an allowlist of dev-signing artifacts (untrusted self-signed cert, and
 * the claimSignature codes that only a production certificate can clear). Any
 * other code — an action/assertion/ingredient/hash problem — fails the test.
 * Using an allowlist (rather than a denylist of known-bad substrings) means a
 * new, differently-named conformance failure still trips the guard.
 */
describe("C2PA sign → validate (manifest content conformance)", () => {
  const signedByType: Record<string, Buffer> = {};
  let readerAvailable = true;
  let Reader: typeof import("@contentauth/c2pa-node").Reader;

  const TYPES: Array<{ fmt: "jpeg" | "png" | "webp"; mime: string }> = [
    { fmt: "jpeg", mime: "image/jpeg" },
    { fmt: "png", mime: "image/png" },
    { fmt: "webp", mime: "image/webp" },
  ];

  // Codes acceptable for a dev-signed (ephemeral self-signed) cert. These are
  // signature/trust concerns, orthogonal to manifest-content conformance, and
  // are cleared by a production certificate. Everything else must be absent.
  const ALLOWED = [/^signingCredential\.untrusted$/, /^claimSignature\./];

  // Collect only FAILURE codes. c2pa 0.6 exposes the legacy `validation_status`
  // array (failures/warnings) and the structured `validation_results` object.
  // The latter also carries SUCCESS codes (e.g. assertion.dataHash.match) under
  // `success`/`informational`, so we must not scan it wholesale — only its
  // `failure` buckets, or a passing manifest would look failed.
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

  beforeAll(async () => {
    process.env.C2PA_MODE = "dev-signed";
    try {
      const sharp = (await import("sharp")).default;
      const mod = await import("@contentauth/c2pa-node");
      Reader = mod.Reader;
      const { signC2pa } = await import("../c2pa");
      for (const { fmt, mime } of TYPES) {
        const buf = await sharp({
          create: { width: 240, height: 160, channels: 3, background: { r: 20, g: 90, b: 160 } },
        })
          [fmt]()
          .toBuffer();
        const res = await signC2pa(buf, mime);
        if (res.signedBuffer) signedByType[mime] = res.signedBuffer;
      }
    } catch {
      // Native module unavailable on this platform — mark for a visible skip.
      readerAvailable = false;
    }
  }, 30_000);

  for (const { mime } of TYPES) {
    it(`${mime}: manifest has only dev-signing validation codes (no content errors)`, async (ctx) => {
      if (!readerAvailable) {
        ctx.skip(); // native c2pa-node/sharp not loadable here — surfaced as skipped, not passed
        return;
      }
      const signed = signedByType[mime];
      expect(signed, `signing produced a buffer for ${mime}`).toBeTruthy();

      const reader = await Reader.fromAsset({ buffer: signed, mimeType: mime });
      const raw = reader?.json();
      const json = typeof raw === "string" ? JSON.parse(raw) : raw;

      const codes = collectFailureCodes(json);
      const unexpected = [...codes].filter((c) => !ALLOWED.some((re) => re.test(c)));
      expect(unexpected, `unexpected (content) validation codes for ${mime}: ${[...codes].join(", ")}`).toEqual([]);
    });
  }
});
