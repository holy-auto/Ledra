import type { ActorAssurance } from "@/lib/auth/mfa";

/**
 * 発行者の本人性保証を監査用の日本語ラベルにする純関数。
 *
 * roadmap 4-14「誰が発行したか」を、既存の証明書監査 (vehicle_histories) に
 * 人が読める形で残すために使う。パスキー (WebAuthn) 検証済みが最も強く、
 * 次いで 2 段階認証 (aal2)、パスワードのみ (aal1) の順。
 */
export function describeAssurance(a: ActorAssurance): string {
  if (a.usedWebAuthn) return "パスキー(生体/セキュリティキー・aal2)";
  if (a.aal === "aal2") return "2段階認証(aal2)";
  if (a.aal === "aal1") return "パスワードのみ(aal1)";
  return "不明";
}
