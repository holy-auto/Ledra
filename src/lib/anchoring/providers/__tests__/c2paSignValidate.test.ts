import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requireNative } from "../../__tests__/nativeImaging";
import { collectFailureCodes } from "./c2paFailureCodes";

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

  beforeAll(async () => {
    originalMode = process.env.C2PA_MODE;
    process.env.C2PA_MODE = "dev-signed";

    // **fail-closed**: 読み込めないことは skip ではなく失敗にする。以前はここで
    // フラグを倒して各 it で ctx.skip() していたため、依存が入らないだけで
    // この適合性ゲートが丸ごと沈黙し、CI が緑のままだった（DECISION_LOG 2026-09-21）。
    // ガードを「読み込み」だけに限定するのは従来どおり。署名はこの後ろで走るので、
    // API 形状の退行やマニフェストの不正は普通のテスト失敗として出る。
    const sharp = (await requireNative(() => import("sharp"), "sharp")).default;
    const mod = await requireNative(() => import("@contentauth/c2pa-node"), "@contentauth/c2pa-node");
    Reader = mod.Reader as unknown as C2paReader;
    if (!Reader) throw new Error("c2pa-node の Reader export が見つかりません（API 形状の退行）");

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
    it(`${mime}: manifest has only dev-signing validation codes (no content errors)`, async () => {
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
      // Backend 型: 先頭は c2pa.opened（DST なし）で、parentOf ingredient をちょうど1つ参照する
      // （Conformulator no_dst_for_opened_action / opened_action_ingredient_reference）。
      const list = (actions?.data?.actions ?? []) as Array<{
        action?: string;
        digitalSourceType?: string;
        parameters?: { ingredients?: unknown[] };
      }>;
      expect(list[0]?.action, `first action is c2pa.opened for ${mime}`).toBe("c2pa.opened");
      expect(list[0]?.digitalSourceType, `c2pa.opened carries no digitalSourceType for ${mime}`).toBeUndefined();
      expect(list[0]?.parameters?.ingredients?.length, `c2pa.opened references one ingredient for ${mime}`).toBe(1);
      const ingredients = (m.ingredients ?? []) as Array<{ relationship?: string }>;
      expect(
        ingredients.map((i) => i.relationship),
        `one parentOf ingredient for ${mime}`,
      ).toEqual(["parentOf"]);
      expect(actions?.data?.allActionsIncluded, `allActionsIncluded=true for ${mime}`).toBe(true);

      // Conformulator rubrics (2026-09-27): the inception action must sit in a *created*
      // actions assertion (inception_action_position), and perceptible transformations
      // such as c2pa.orientation need a digitalSourceType too.
      expect(actions?.created, `actions assertion is a created assertion for ${mime}`).toBe(true);
      const orientation = list.find((a) => a.action === "c2pa.orientation");
      expect(orientation?.digitalSourceType, `c2pa.orientation has digitalSourceType for ${mime}`).toBeTruthy();
    });
  }

  // Fallback path: when the upload pipeline could NOT re-encode/strip (sharp
  // failed) and signs the original as-is, the manifest must not certify
  // transforms that never happened — only c2pa.created, allActionsIncluded=false.
  it("fallback (transform not applied) asserts only c2pa.opened, with allActionsIncluded=true", async () => {
    const { signC2pa } = await import("../c2pa");
    const sharp = (await requireNative(() => import("sharp"), "sharp")).default;
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
    // 原本をそのまま署名しただけ＝opened 以外に何もしていないので、台帳は完全（true）。
    expect(actions?.data?.allActionsIncluded, "allActionsIncluded=true on fallback").toBe(true);
    const actionNames = ((actions?.data?.actions ?? []) as Array<{ action?: string }>).map((a) => a.action);
    expect(actionNames, "only c2pa.opened on fallback").toEqual(["c2pa.opened"]);
    // Summary must mirror the embedded manifest (drift guard for the fallback too).
    expect(res.manifestSummary?.allActionsIncluded, "summary allActionsIncluded mirrors fallback").toBe(true);
  });

  // The uploaded original (with GPS) becomes the parentOf ingredient. It must not carry
  // the location into the signed output: c2pa-rs keeps only a hash, the format and a
  // pixel-derived thumbnail. This is what makes c2pa.opened safe for Ledra's privacy rule.
  it("the GPS in the uploaded original does not reach the signed output or its manifest", async () => {
    const { signC2pa } = await import("../c2pa");
    const { stripGpsAndReadExif } = await import("../../imageExif");
    const sharp = (await requireNative(() => import("sharp"), "sharp")).default;
    const exifr = (await import("exifr")).default;
    const original = await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 90, g: 60, b: 30 } },
    })
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "35/1 40/1 12/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "139/1 43/1 5/1",
        },
      })
      .toBuffer();
    expect((await exifr.gps(original))?.latitude, "fixture really carries GPS").toBeCloseTo(35.67, 1);

    const ex = await stripGpsAndReadExif(original);
    const res = await signC2pa(ex.strippedBuffer, "image/jpeg", undefined, ex, original);
    expect(res.signedBuffer, "signed").toBeTruthy();
    expect(await exifr.gps(res.signedBuffer!).catch(() => undefined), "no GPS in the signed file").toBeFalsy();

    const reader = await Reader.fromAsset({ buffer: res.signedBuffer!, mimeType: "image/jpeg" });
    const raw = reader?.json();
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    // 座標のフィールド名で見る（"GPS" だけだと edited.metadata の説明文 "EXIF/GPS metadata removed" に当たる）。
    expect(text, "no GPS coordinate field in the manifest store").not.toMatch(/GPSLat|GPSLong|latitude|longitude/i);
  });
});
