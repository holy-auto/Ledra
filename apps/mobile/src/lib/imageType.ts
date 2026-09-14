/**
 * 画像 URI の拡張子から MIME を決める純関数。
 *
 * ピッカーが返す `mimeType` は Android では**元ファイル**のものなので、
 * 書き出されたファイルの実体を知るには拡張子を見る必要がある（lib/pickImage.ts 参照）。
 */

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** 判別できなければ null（呼び出し側で mimeType へフォールバックする） */
export function imageTypeFromUri(uri: string): string | null {
  const ext = uri.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return BY_EXT[ext] ?? null;
}
