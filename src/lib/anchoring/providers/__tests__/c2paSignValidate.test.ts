import { describe, it, expect, beforeAll, afterAll } from "vitest";

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
  // Structural type for the bits we use. The package's own `Reader` type is not
  // reachable via `typeof import(...).Reader` under bundler resolution (its .d.ts
  // re-exports use .js/.d.ts specifiers), so we describe the surface we call.
  type C2paReader = {
    fromAsset(input: { buffer: Buffer; mimeType: string }): Promise<{ json(): unknown } | null>;
  };
  let Reader: C2paReader;
  let originalMode: string | undefined;

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
    originalMode = process.env.C2PA_MODE;
    process.env.C2PA_MODE = "dev-signed";

    // Only a native-module load failure (sharp / c2pa-node unavailable on this
    // platform) is a legitimate skip. Guard ONLY the loads — signing runs after
    // the guard so an @contentauth/c2pa-node API-shape regression or a broken
    // manifest fails the test loudly instead of masquerading as a platform skip
    // (which would silently disable the conformance guard this file exists for).
    let sharp: typeof import("sharp").default;
    try {
      sharp = (await import("sharp")).default;
      const mod = await import("@contentauth/c2pa-node");
      Reader = mod.Reader as unknown as C2paReader;
      if (!Reader) throw new Error("c2pa-node Reader export missing");
    } catch {
      readerAvailable = false;
      return;
    }

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
  }, 30_000);

  afterAll(() => {
    if (originalMode === undefined) delete process.env.C2PA_MODE;
    else process.env.C2PA_MODE = originalMode;
  });

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

      // C2PA Conformance Program (Additional Conformance Requirements v0.2) fields.
      const m = json?.manifests?.[json.active_manifest] ?? {};
      const cgi = (m.claim_generator_info ?? []) as Array<{ specVersion?: string }>;
      expect(
        cgi.some((e) => e.specVersion === "2.4"),
        `claim_generator_info.specVersion=2.4 for ${mime}`,
      ).toBe(true);

      // Drift guard: the stored summary must report the same specVersion that was
      // actually embedded, or the persisted c2pa_manifest record silently diverges
      // from the manifest it summarizes.
      const { buildC2paManifestSummary } = await import("../c2pa");
      expect(
        buildC2paManifestSummary("dev-signed").specVersion,
        `summary specVersion matches manifest for ${mime}`,
      ).toBe(cgi.find((e) => e.specVersion)?.specVersion);

      const actions = (m.assertions ?? []).find((a: { label?: string }) => a.label?.startsWith("c2pa.actions"));
      expect(typeof actions?.data?.allActionsIncluded, `allActionsIncluded present for ${mime}`).toBe("boolean");
      const created = (actions?.data?.actions ?? []).find((a: { action?: string }) => a.action === "c2pa.created");
      expect(created?.digitalSourceType, `c2pa.created has digitalSourceType for ${mime}`).toBeTruthy();
    });
  }

  // Fallback path: when the upload pipeline could NOT re-encode/strip (sharp
  // failed) and signs the original as-is, the manifest must not certify
  // transforms that never happened — only c2pa.created, allActionsIncluded=false.
  it("fallback (transform not applied) asserts only c2pa.created with allActionsIncluded=false", async (ctx) => {
    if (!readerAvailable) {
      ctx.skip();
      return;
    }
    const { signC2pa } = await import("../c2pa");
    const sharp = (await import("sharp")).default;
    const buf = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const res = await signC2pa(buf, "image/jpeg", undefined, {
      reencoded: false,
      orientationApplied: false,
      metadataRemoved: false,
    });
    expect(res.signedBuffer, "fallback signing produced a buffer").toBeTruthy();

    const reader = await Reader.fromAsset({ buffer: res.signedBuffer!, mimeType: "image/jpeg" });
    const raw = reader?.json();
    const json = typeof raw === "string" ? JSON.parse(raw) : raw;
    const m = json?.manifests?.[json.active_manifest] ?? {};
    const actions = (m.assertions ?? []).find((a: { label?: string }) => a.label?.startsWith("c2pa.actions"));
    expect(actions?.data?.allActionsIncluded, "allActionsIncluded=false on fallback").toBe(false);
    const actionNames = ((actions?.data?.actions ?? []) as Array<{ action?: string }>).map((a) => a.action);
    expect(actionNames, "only c2pa.created on fallback").toEqual(["c2pa.created"]);
    // Summary must mirror the embedded manifest (drift guard for the fallback too).
    expect(res.manifestSummary?.allActionsIncluded, "summary allActionsIncluded mirrors fallback").toBe(false);
  });
});
