/**
 * 証明書画像関連の定数・ユーティリティ
 */

/** Supabase Storage のバケット名 */
export const CERTIFICATE_IMAGE_BUCKET = "assets";

/** バイト数を人間が読みやすい形式にフォーマットする */
export function formatCertificateImageBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = bytes;

  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }

  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}
