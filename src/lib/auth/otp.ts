/**
 * 汎用 OTP モジュール（IMP-012）。
 *
 * 顧客ポータル（customerPortalServer.ts）で成熟した OTP パターンを
 * スタッフログインや招待検証でも使えるよう抽象化。
 *
 * 設計判断:
 * - 既存の customerPortalServer.ts は顧客固有ロジック（phoneLast4Hash、
 *   tenant スコープ検索）と密結合しているため、ここでは OTP の生成・
 *   ハッシュ・検証の「エンジン」のみを提供する。
 * - 顧客ポータルは引き続き既存コードを使う（移行は将来の判断）。
 * - チャネル（email/SMS）の送信は呼び出し側の責任。
 */
import { randomInt, createHmac, timingSafeEqual } from "crypto";

// ── 定数 ──

/** OTP コードの桁数。 */
export const OTP_DIGITS = 6;
/** デフォルト有効期限（分）。 */
export const OTP_DEFAULT_TTL_MIN = 5;
/** デフォルト最大試行回数。 */
export const OTP_DEFAULT_MAX_ATTEMPTS = 3;

// ── 生成 ──

/** 6 桁の OTP コードを生成する（先頭ゼロあり、暗号論的乱数）。 */
export function generateOtp(): string {
  const n = randomInt(10 ** OTP_DIGITS);
  return String(n).padStart(OTP_DIGITS, "0");
}

// ── ハッシュ ──

/**
 * OTP コードを HMAC-SHA256 でハッシュする。
 * scope はテナント ID やメールなどの文脈情報でレインボーテーブル攻撃を防ぐ。
 *
 * @param code    - 6 桁の OTP コード
 * @param scope   - コンテキスト文字列（例: `"staff|v1|{tenantId}|{email}"`）
 * @param secret  - HMAC シークレット（環境変数から取得）
 */
export function hashOtp(code: string, scope: string, secret: string): string {
  return createHmac("sha256", secret).update(`${scope}|${code}`).digest("hex");
}

// ── 検証 ──

export type OtpVerifyResult = { valid: true } | { valid: false; reason: "expired" | "max_attempts" | "mismatch" };

/**
 * OTP コードを検証する。タイミングセーフ比較で実施。
 *
 * @param input       - ユーザーが入力したコード
 * @param storedHash  - DB に保存済みのハッシュ
 * @param scope       - hashOtp に渡したのと同じスコープ
 * @param secret      - HMAC シークレット
 * @param expiresAt   - 有効期限（ISO 8601）
 * @param attempts    - これまでの試行回数
 * @param maxAttempts - 最大試行回数（デフォルト 3）
 */
export function verifyOtp(
  input: string,
  storedHash: string,
  scope: string,
  secret: string,
  expiresAt: string,
  attempts: number,
  maxAttempts: number = OTP_DEFAULT_MAX_ATTEMPTS,
): OtpVerifyResult {
  if (attempts >= maxAttempts) return { valid: false, reason: "max_attempts" };
  // **壊れた期限は期限切れ扱いにする（fail closed）。**
  // `new Date("こわれた").getTime()` は NaN で、`NaN < Date.now()` は false なので、
  // 以前は保存値が壊れているだけで**有効期限の無い OTP** になっていた。
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) return { valid: false, reason: "expired" };

  const inputHash = hashOtp(input, scope, secret);
  // ponytail: タイミングセーフ比較。hex 文字列同士なのでバイト長は常に一致。
  const a = Buffer.from(inputHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}

// ── ヘルパー ──

/** 有効期限の ISO 文字列を生成する。 */
export function otpExpiresAt(ttlMin: number = OTP_DEFAULT_TTL_MIN): string {
  return new Date(Date.now() + ttlMin * 60 * 1000).toISOString();
}
