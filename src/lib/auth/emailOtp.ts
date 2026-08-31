/**
 * IMP-012: メール OTP の実データ配線（IO層）。
 *
 * `src/lib/auth/otp.ts` は生成・ハッシュ・検証のみを提供する純関数エンジンで、
 * 保存先は呼び出し側の責任という設計だった（ADR なし、同ファイルのコメント参照）。
 * ここでは `email_otp_codes` テーブルへの読み書きを担い、メール送信は
 * 呼び出し側（API ルート）の責任のまま残す。
 *
 * 現状の利用箇所: モバイルアプリのサインアップ直後メール確認
 * （purpose: "mobile_signup"）。招待検証等への拡張は otp.ts のコメント参照。
 *
 * ハッシュの pepper は `CUSTOMER_AUTH_PEPPER` を再利用する。名称は顧客ポータル
 * 由来だが、tenant-api-keys / passport トークン等でも汎用 HMAC pepper として
 * 既に使われており、scope 文字列（tenant/user/purpose を含む）で用途ごとに
 * 分離しているため衝突しない（新しい環境変数を増やさない）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOtp, hashOtp, verifyOtp, otpExpiresAt, OTP_DEFAULT_MAX_ATTEMPTS } from "./otp";

const PEPPER = process.env.CUSTOMER_AUTH_PEPPER ?? "";

export type EmailOtpPurpose = "mobile_signup";

function scope(tenantId: string, userId: string, purpose: EmailOtpPurpose): string {
  return `email-otp|v1|${tenantId}|${userId}|${purpose}`;
}

/** 新しい OTP コードを発行し保存する。生の6桁コードを返す（メール送信は呼び出し側）。 */
export async function issueEmailOtp(
  admin: SupabaseClient,
  params: { tenantId: string; userId: string; email: string; purpose: EmailOtpPurpose },
): Promise<string> {
  const code = generateOtp();
  const codeHash = hashOtp(code, scope(params.tenantId, params.userId, params.purpose), PEPPER);
  const { error } = await admin.from("email_otp_codes").insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    email: params.email,
    purpose: params.purpose,
    code_hash: codeHash,
    expires_at: otpExpiresAt(),
  });
  if (error) throw error;
  return code;
}

export type EmailOtpVerifyResult =
  { ok: true } | { ok: false; reason: "not_found" | "expired" | "max_attempts" | "mismatch" };

/** 直近発行された未使用コードと照合する。 */
export async function confirmEmailOtp(
  admin: SupabaseClient,
  params: { tenantId: string; userId: string; purpose: EmailOtpPurpose; code: string },
): Promise<EmailOtpVerifyResult> {
  const { data: row, error } = await admin
    .from("email_otp_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("tenant_id", params.tenantId)
    .eq("user_id", params.userId)
    .eq("purpose", params.purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!row) return { ok: false, reason: "not_found" };

  const codeScope = scope(params.tenantId, params.userId, params.purpose);
  const result = verifyOtp(
    params.code,
    row.code_hash as string,
    codeScope,
    PEPPER,
    row.expires_at as string,
    row.attempts as number,
    OTP_DEFAULT_MAX_ATTEMPTS,
  );

  if (!result.valid) {
    // mismatch だけ attempts を進める。expired / max_attempts は既に確定済みの
    // 状態なので、これ以上進めても再送を促す以外に変わらない。
    // ponytail: read-then-write の単純な +1（真のアトミック増分ではない）。
    // 同時リクエストで1回分under-countされ得るが、呼び出し元(mobile route)が
    // userId 単位で 5 req/300s のレート制限を別途掛けているため総当たり耐性は
    // 実質的に保たれる。真のアトミック性が要るなら Postgres 関数化する。
    if (result.reason === "mismatch") {
      await admin
        .from("email_otp_codes")
        .update({ attempts: (row.attempts as number) + 1 })
        .eq("id", row.id);
    }
    return { ok: false, reason: result.reason };
  }

  await admin.from("email_otp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}
