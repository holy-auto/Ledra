import { describe, it, expect, beforeAll } from "vitest";

/**
 * stripGpsAndReadExif must report per-action outcomes that reflect what actually
 * happened, so the C2PA action ledger never certifies a no-op (e.g. claiming
 * `exif_gps_metadata_removed` for an image that carried no metadata). A synthetic
 * sharp image has no EXIF/GPS/orientation, so removal and orientation must be
 * false while the re-encode (reencoded) still ran.
 */
describe("stripGpsAndReadExif per-action outcomes", () => {
  let available = true;
  let sharp: typeof import("sharp").default;
  let stripGpsAndReadExif: typeof import("../imageExif").stripGpsAndReadExif;

  beforeAll(async () => {
    try {
      sharp = (await import("sharp")).default;
      ({ stripGpsAndReadExif } = await import("../imageExif"));
    } catch {
      available = false;
    }
  });

  it("a metadata-free image reports reencoded=true but orientationApplied/metadataRemoved=false", async (ctx) => {
    if (!available) {
      ctx.skip();
      return;
    }
    const jpeg = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const res = await stripGpsAndReadExif(jpeg);
    expect(res.reencoded, "re-encode ran").toBe(true);
    expect(res.orientationApplied, "no EXIF orientation to bake in").toBe(false);
    expect(res.metadataRemoved, "no EXIF/GPS was present, so nothing was removed").toBe(false);
    expect(res.gps, "no GPS").toBeNull();
    expect(res.strippedBuffer.length, "produced a buffer").toBeGreaterThan(0);
  });
});
