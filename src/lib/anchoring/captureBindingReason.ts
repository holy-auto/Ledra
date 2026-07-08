/**
 * 「担保（verified/premium）に達しなかった理由」を、撮影束縛の各リンクから導く純関数。
 *
 * capture_binding_reason 列に保存し、監査・UI で「なぜ basic 止まりか」を説明する。
 * 担保が成立（全リンク充足）なら null。最初に欠けたリンクを理由として返す。
 *
 * リンク: deviceOk（端末アテステーション）→ nonceOk（単回nonceの新鮮な消費）→
 *        sealOk（撮影時封印: 本番C2PA or TSA）。
 */

import type { ConsumeNonceResult } from "@/lib/certificates/captureNonce";

export type CaptureBindingReason =
  | "gallery_upload" // 端末トークンも nonce も無い = Web/ギャラリー流用
  | "attestation_failed" // 端末アテステーション未検証
  | "nonce_replay" // nonce が既に消費済み（リプレイ）
  | "nonce_expired" // nonce 期限切れ
  | "nonce_cert_mismatch" // 別 cert 用 nonce の流用
  | "offline_no_nonce" // nonce 未送信/不明（オフライン撮影後同期など）
  | "nonce_error" // 消費 RPC エラー（fail-closed）
  | "no_capture_seal"; // 端末+nonce は OK だが封印（C2PA/TSA）が無い

export interface CaptureBindingInput {
  hasDeviceToken: boolean;
  hasNonce: boolean;
  deviceVerified: boolean;
  /** consumeCaptureNonce の結果。nonce 未送信なら null。 */
  nonceResult: ConsumeNonceResult | null;
  /** 撮影時封印（本番C2PA or TSA）が得られたか。 */
  sealOk: boolean;
}

/**
 * 担保が成立していれば null、未成立なら最初に欠けたリンクの理由を返す。
 */
export function deriveCaptureBindingReason(input: CaptureBindingInput): CaptureBindingReason | null {
  const { hasDeviceToken, hasNonce, deviceVerified, nonceResult, sealOk } = input;

  // 何も撮影束縛の材料が無い = 非担保経路（Web/ギャラリー）。
  if (!hasDeviceToken && !hasNonce) return "gallery_upload";

  if (!deviceVerified) return "attestation_failed";

  if (nonceResult !== "ok") {
    switch (nonceResult) {
      case "consumed":
        return "nonce_replay";
      case "expired":
        return "nonce_expired";
      case "mismatch":
        return "nonce_cert_mismatch";
      case "error":
        return "nonce_error";
      // not_found / null（未送信）はオフライン同期などで「新鮮な nonce が無い」ケース。
      default:
        return "offline_no_nonce";
    }
  }

  if (!sealOk) return "no_capture_seal";

  return null; // 全リンク充足 = 担保成立。
}
