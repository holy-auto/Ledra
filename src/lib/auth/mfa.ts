/**
 * Admin 2FA (TOTP) helper — Supabase Auth MFA を thin にラップ。
 *
 * Supabase の MFA API:
 *   - supabase.auth.mfa.enroll({ factorType: 'totp' })       # 登録開始 → QR 取得
 *   - supabase.auth.mfa.challenge({ factorId })              # チャレンジ生成
 *   - supabase.auth.mfa.verify({ factorId, challengeId, code })
 *   - supabase.auth.mfa.unenroll({ factorId })
 *
 * このモジュールはエラー shape の正規化と「強制要件」のチェック (admin /
 * super_admin role の MFA 必須化) を提供する。
 *
 * 制限事項:
 *   - Supabase MFA は v2.45+ が必要。version gate で graceful fallback
 *   - super_admin に MFA 強制すると emergency 緊急アクセスができなくなるので
 *     break-glass account を別途用意すること (本実装には含まれない)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface MfaEnrollResult {
  factor_id: string;
  /** QR コードに焼く otpauth:// URI */
  uri: string;
  /** ユーザに表示する base32 シークレット (QR 読めない場合の手動入力用) */
  secret: string;
}

export type MfaResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * TOTP factor の登録を開始。返却された QR uri を表示する。verify は
 * 別エンドポイントで `verifyEnroll(factorId, code)` を呼ぶ。
 */
export async function enrollTotp(supabase: Db): Promise<MfaResult<MfaEnrollResult>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.enroll !== "function") {
    return { ok: false, error: "mfa_unsupported_supabase_version" };
  }

  const res = await mfa.enroll({ factorType: "totp", friendlyName: "Ledra Admin" });
  if (res.error || !res.data) {
    return { ok: false, error: res.error?.message ?? "mfa_enroll_failed" };
  }
  return {
    ok: true,
    data: {
      factor_id: res.data.id as string,
      uri: (res.data.totp?.uri as string) ?? "",
      secret: (res.data.totp?.secret as string) ?? "",
    },
  };
}

/** 登録時の verify。成功すると factor が active になる。 */
export async function verifyEnroll(supabase: Db, factorId: string, code: string): Promise<MfaResult<void>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.challenge !== "function" || typeof mfa.verify !== "function") {
    return { ok: false, error: "mfa_unsupported_supabase_version" };
  }
  const ch = await mfa.challenge({ factorId });
  if (ch.error || !ch.data?.id) {
    return { ok: false, error: ch.error?.message ?? "mfa_challenge_failed" };
  }
  const ver = await mfa.verify({ factorId, challengeId: ch.data.id, code });
  if (ver.error) {
    return { ok: false, error: ver.error.message ?? "mfa_verify_failed" };
  }
  return { ok: true, data: undefined };
}

export async function unenrollFactor(supabase: Db, factorId: string): Promise<MfaResult<void>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.unenroll !== "function") {
    return { ok: false, error: "mfa_unsupported_supabase_version" };
  }
  const res = await mfa.unenroll({ factorId });
  if (res.error) return { ok: false, error: res.error.message ?? "mfa_unenroll_failed" };
  return { ok: true, data: undefined };
}

export interface MfaFactorSummary {
  id: string;
  factor_type: string;
  friendly_name: string | null;
  status: string;
  created_at: string | null;
}

/** List all MFA factors registered for the current user. */
export async function listFactors(supabase: Db): Promise<MfaResult<MfaFactorSummary[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.listFactors !== "function") {
    return { ok: false, error: "mfa_unsupported_supabase_version" };
  }
  const res = await mfa.listFactors();
  if (res.error) return { ok: false, error: res.error.message ?? "mfa_list_failed" };

  const totp = (res.data?.totp ?? []) as Array<{
    id: string;
    factor_type?: string;
    friendly_name?: string | null;
    status?: string;
    created_at?: string;
  }>;
  return {
    ok: true,
    data: totp.map((f) => ({
      id: f.id,
      factor_type: f.factor_type ?? "totp",
      friendly_name: f.friendly_name ?? null,
      status: f.status ?? "unknown",
      created_at: f.created_at ?? null,
    })),
  };
}

/**
 * 現在のセッションが MFA verified (aal2) かどうか。route handler で
 * admin / super_admin が叩いた route は aal2 を要求する想定。
 */
export async function isAal2Verified(supabase: Db): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.getAuthenticatorAssuranceLevel !== "function") return false;
  const res = await mfa.getAuthenticatorAssuranceLevel();
  return res.data?.currentLevel === "aal2";
}

export interface ActorAssurance {
  /** 現セッションの認証保証レベル。取得不能なら null。 */
  aal: "aal1" | "aal2" | null;
  /** この認証にパスキー (WebAuthn) が使われたか。 */
  usedWebAuthn: boolean;
}

/**
 * 現在のセッションの「本人性の強さ」を返す。証明書発行時に「誰が・どの強度で
 * 発行したか」を監査へ残すために使う (roadmap 4-14 の狙い)。
 *
 * Supabase Auth は totp / phone / webauthn を MFA factor として扱う。パスキーで
 * ステップアップしたセッションは currentAuthenticationMethods に webauthn を含み、
 * currentLevel=aal2 になる。取得不能 (未対応バージョン / 失敗) は
 * { aal: null, usedWebAuthn: false } にフォールバックする (発行はブロックしない)。
 */
export async function getActorAssurance(supabase: Db): Promise<ActorAssurance> {
  const fallback: ActorAssurance = { aal: null, usedWebAuthn: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mfa = (supabase.auth as any)?.mfa;
  if (!mfa || typeof mfa.getAuthenticatorAssuranceLevel !== "function") return fallback;
  try {
    const res = await mfa.getAuthenticatorAssuranceLevel();
    const level = res.data?.currentLevel ?? null;
    // currentAuthenticationMethods は詳細オブジェクトの配列にも RFC 形式の
    // 文字列配列 (['password','webauthn']) にもなりうるので両対応する。
    const methods = (res.data?.currentAuthenticationMethods ?? []) as Array<string | { method?: string }>;
    const usedWebAuthn = methods.some((m) => {
      const name = typeof m === "string" ? m : m?.method;
      return typeof name === "string" && name.includes("webauthn");
    });
    return {
      aal: level === "aal2" ? "aal2" : level === "aal1" ? "aal1" : null,
      usedWebAuthn,
    };
  } catch {
    return fallback;
  }
}
