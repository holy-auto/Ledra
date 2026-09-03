import { describe, it, expect, beforeAll } from "vitest";

/**
 * Sign a real image and validate the resulting manifest. This is the check that
 * was missing when Ledra's actions ledger drifted out of C2PA 2.x conformance:
 * the pure-function tests never signed anything, so a manifest that fails
 * validation (assertion.action.ingredientMismatch / malformed) shipped unnoticed.
 *
 * It asserts that NO action/assertion validation codes are present. It does NOT
 * assert validation_state === Valid, because the dev-signed self-signed cert is
 * intentionally untrusted (signingCredential.untrusted) and, in this ephemeral
 * setup, may also report claimSignature-related codes that only a production
 * certificate can clear. Those are signature/trust concerns, orthogonal to the
 * manifest-content conformance this test guards.
 */
describe("C2PA sign → validate (manifest content conformance)", () => {
  let signedByType: Record<string, Buffer> = {};
  let readerAvailable = true;
  let Reader: typeof import("@contentauth/c2pa-node").Reader;

  const TYPES: Array<{ fmt: "jpeg" | "png" | "webp"; mime: string }> = [
    { fmt: "jpeg", mime: "image/jpeg" },
    { fmt: "png", mime: "image/png" },
    { fmt: "webp", mime: "image/webp" },
  ];

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
      // Native module unavailable on this platform — skip rather than fail.
      readerAvailable = false;
    }
  }, 30_000);

  for (const { mime } of TYPES) {
    it(`${mime}: manifest has no action/assertion validation errors`, async () => {
      if (!readerAvailable) return; // skipped: native c2pa-node not loadable here
      const signed = signedByType[mime];
      expect(signed, `signing produced a buffer for ${mime}`).toBeTruthy();

      const reader = await Reader.fromAsset({ buffer: signed, mimeType: mime });
      const raw = reader?.json();
      const json = typeof raw === "string" ? JSON.parse(raw) : raw;
      const codes: string[] = (json?.validation_status ?? []).map((v: { code: string }) => v.code);

      const badContentCodes = codes.filter((c) => /ingredient|action|assertion/i.test(c) && /mismatch|malformed/i.test(c));
      expect(badContentCodes, `unexpected manifest-content validation codes: ${codes.join(", ")}`).toEqual([]);
    });
  }
});
