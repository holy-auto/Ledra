import { describe, it, expect, beforeAll } from "vitest";
import { requireNative } from "./nativeImaging";

/**
 * stripGpsAndReadExif must report per-action outcomes that reflect what actually
 * happened, so the C2PA action ledger never certifies a no-op (e.g. claiming
 * `exif_gps_metadata_removed` for an image that carried no metadata). A synthetic
 * sharp image has no EXIF/GPS/orientation, so removal and orientation must be
 * false while the re-encode (reencoded) still ran.
 */
describe("stripGpsAndReadExif per-action outcomes", () => {
  let sharp: typeof import("sharp").default;
  let stripGpsAndReadExif: typeof import("../imageExif").stripGpsAndReadExif;

  beforeAll(async () => {
    // **fail-closed**（DECISION_LOG 2026-09-21）。C2PA ゲートと同じ形の
    // 「読み込めなければ skip」だったので、同じ根で直す。sharp は optional ですらない
    // 通常の依存なので、読み込めないのはインストールが壊れているということ。
    sharp = (await requireNative(() => import("sharp"), "sharp")).default;
    // `../imageExif` はアプリのモジュールで、sharp / exifr は関数の中で遅延 import される。
    // つまりここが失敗するのはネイティブ依存の不在ではなく**そのモジュール自身の退行**なので、
    // requireNative で包むと「node_modules を見ろ」という的外れな案内になる（PR #1115 の指摘）。
    ({ stripGpsAndReadExif } = await import("../imageExif"));
  });

  it("a metadata-free image reports reencoded=true but orientationApplied/metadataRemoved=false", async () => {
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
