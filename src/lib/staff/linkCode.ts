import crypto from "crypto";

/**
 * 外注連携コードの書式と生成。
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

/**
 * 一様な乱数を得るための拒否閾値。
 *
 * 256 は 31 で割り切れない（余り 8）。`randomBytes % 31` をそのまま使うと
 * **先頭8文字だけ出現機会が1回多く**なり、乱数が偏る（CodeQL:
 * "Creating biased random numbers from a cryptographically secure source"）。
 * 閾値以上のバイトは捨てて引き直すことで、31文字が等確率になる。
 */
export const REJECTION_THRESHOLD = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;

/** 暗号論的乱数から偏りなくコードを作る。 */
export function generateCode(): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.randomBytes(CODE_LENGTH)) {
      if (b >= REJECTION_THRESHOLD) continue; // 偏るバイトは捨てる
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}
