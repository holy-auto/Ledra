/**
 * マジックバイト (ファイル先頭バイト列) による MIME 判定の唯一の実装。
 *
 * クライアント申告の MIME はなりすまし可能なので、アップロード系ルートは
 * 実バイトでファイル形式を検証する。従来 3 箇所 (certificate 画像 upload /
 * 車検証 OCR / certificate メディア) に重複していた判定をここへ集約する。
 *
 * 判定は保守的: 先頭バイトが既知シグネチャに一致しなければ null を返す。
 * 呼び出し側は用途ごとの許可リストで戻り値をさらに絞り込む。
 */

export type DetectedMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/heic"
  | "video/mp4"
  | "video/quicktime";

/**
 * バッファ先頭のマジックバイトから MIME を判定する。
 * 12 バイト未満、または既知シグネチャに一致しない場合は null。
 */
export function detectMagicByteMime(buffer: Buffer): DetectedMime | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A (8 バイト完全一致で誤検出を避ける)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: 47 49 46 38 ("GIF8")
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "image/gif";
  }
  // WebP: 52 49 46 46 ("RIFF") .... 57 45 42 50 ("WEBP")
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  // ISO BMFF (mp4 / mov / heic): offset 4 に 'ftyp' box、offset 8 に major brand。
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "mif1"].includes(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    // MP4 family. iPhone / Android / desktop キャプチャで実際に見られる major brand。
    const mp4Brands = new Set(["isom", "mp42", "mp41", "avc1", "iso2", "iso4", "iso5", "iso6", "M4V ", "dash"]);
    if (mp4Brands.has(brand)) return "video/mp4";
  }
  return null;
}
