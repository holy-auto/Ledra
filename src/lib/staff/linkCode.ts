/**
 * 外注連携コードの書式。
 *
 * server-only の tenantLink.ts から切り出してある（あちらはサービスロールを掴むので
 * テストから import できない）。ここは純粋な文字列処理だけ。
 */

/**
 * 電話や口頭で伝える前提の英数字。紛らわしい文字（0/O, 1/I/L）を外してある。
 * 読み違えは「コードが違う」で終わってしまい、原因が分からないまま運用が詰まる。
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 10;

/**
 * 入力ゆれ（小文字・空白・ハイフン）を吸収する。
 * メモから転記するときに区切りを入れる人がいるので、それで弾かない。
 */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
