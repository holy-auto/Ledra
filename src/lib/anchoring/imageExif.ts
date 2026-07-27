/**
 * EXIF parsing + GPS stripping for certificate images.
 *
 * We want to record *when* and on *what device* the photo was taken
 * (useful signal for authenticity), but GPS coordinates must never
 * make it to Supabase Storage — customers routinely submit photos
 * from their home driveway, and leaking that location would be a
 * privacy incident.
 */

export interface ExifExtraction {
  /** Bytes to upload to Storage (GPS removed when possible). */
  strippedBuffer: Buffer;
  /** Original capture time from EXIF, if present. */
  capturedAt: Date | null;
  /** Camera/phone model as reported by EXIF. */
  deviceModel: string | null;
  /** True when we successfully stripped GPS tags (also true when no GPS was present). */
  gpsStripped: boolean;
  /**
   * 撮影GPS座標（**メモリ内のみ**）。店舗/作業場所との整合性チェックに使うだけで、
   * 呼び出し側は照合後に必ず破棄する（storage にも DB にも生座標は保存しない）。
   * // ponytail: GPS は活用するが永続化しない。照合結果（verdict）のみ保存する方針。
   */
  gps: { lat: number; lng: number } | null;
}

/**
 * Parse EXIF metadata and return a buffer safe to upload.
 * Any failure falls back to the original buffer with null metadata —
 * we never want hashing/EXIF parsing to block an upload.
 */
export async function stripGpsAndReadExif(buffer: Buffer): Promise<ExifExtraction> {
  // JPEG, HEIC/HEIF and WebP may carry EXIF. PNG typically doesn't,
  // and sharp's metadata stripping handles all of them safely.
  try {
    const [{ default: sharp }, exifr] = await Promise.all([import("sharp"), import("exifr")]);

    // Read metadata up-front so we preserve it in the response even
    // though we're about to drop it from the stored file.
    let capturedAt: Date | null = null;
    let deviceModel: string | null = null;
    try {
      const meta = (await exifr.parse(buffer, {
        pick: ["DateTimeOriginal", "CreateDate", "Model", "Make"],
      })) as
        | {
            DateTimeOriginal?: Date;
            CreateDate?: Date;
            Model?: string;
            Make?: string;
          }
        | undefined;
      if (meta) {
        capturedAt = meta.DateTimeOriginal ?? meta.CreateDate ?? null;
        const make = meta.Make ? String(meta.Make).trim() : "";
        const model = meta.Model ? String(meta.Model).trim() : "";
        deviceModel = [make, model].filter(Boolean).join(" ") || null;
      }
    } catch {
      // Non-fatal: EXIF may be missing/corrupt.
    }

    // GPS を **メモリ内でのみ** 読む（保存はしない。店舗/作業場所との照合に使い破棄）。
    // exifr.gps() は GPS IFD から十進の {latitude, longitude} を返す（無ければ undefined）。
    let gps: { lat: number; lng: number } | null = null;
    try {
      const g = (await exifr.gps(buffer)) as { latitude?: number; longitude?: number } | undefined;
      if (g && typeof g.latitude === "number" && typeof g.longitude === "number") {
        gps = { lat: g.latitude, lng: g.longitude };
      }
    } catch {
      // Non-fatal: GPS may be absent/corrupt.
    }

    // Re-encode without metadata. `.rotate()` bakes in orientation
    // before we drop the EXIF that described it, so the visual
    // result matches what the user captured. Sharp strips all
    // metadata by default on output, so simply NOT calling
    // `.withMetadata()` is what removes EXIF/GPS.
    const stripped = await sharp(buffer).rotate().toBuffer();

    return {
      strippedBuffer: stripped,
      capturedAt,
      deviceModel,
      gpsStripped: true,
      gps,
    };
  } catch (err) {
    console.warn("[imageExif] strip failed, falling back to original buffer", err);
    return {
      strippedBuffer: buffer,
      capturedAt: null,
      deviceModel: null,
      gpsStripped: false,
      gps: null,
    };
  }
}

// Currently unused but exported so the upload route can hint at
// expected image kinds later (e.g. to short-circuit PNGs).
export function exifMayContainGps(contentType: string): boolean {
  return (
    contentType === "image/jpeg" ||
    contentType === "image/heic" ||
    contentType === "image/heif" ||
    contentType === "image/webp"
  );
}
