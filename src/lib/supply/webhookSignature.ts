/**
 * 供給パートナーの受注確定 Webhook の HMAC 署名ユーティリティ。
 *
 * パートナーは共有シークレットで本文を HMAC-SHA256 署名し、
 * `X-Ledra-Signature: sha256=<hex>` ヘッダで送る。受信側はこれを検証する。
 * cronAuth と同じく node crypto + timingSafeEqual (タイミング攻撃対策)。
 */
import crypto from "crypto";

/** rawBody を secret で HMAC-SHA256 署名し `sha256=<hex>` 形式を返す。 */
export function computeSupplyWebhookSignature(rawBody: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** 署名ヘッダを検証する。ヘッダ/シークレット欠落・不一致は false。定数時間比較。 */
export function verifySupplyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = computeSupplyWebhookSignature(rawBody, secret);
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** パートナーに渡す新しい Webhook シークレットを生成する (whsec_ + 48 hex)。 */
export function generateSupplyWebhookSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("hex");
}
