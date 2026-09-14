/**
 * 証明書版遷移ヘルパー（IMP-030）。
 *
 * v2.0 §12.3-12.4 / ADR-0004:
 *   - 訂正完了時: v1(VERIFIED) → SUPERSEDED, v2 → VERIFIED (Current)
 *   - revoke 時: VERIFIED → REVOKED
 *   - 旧 QR からは「新しい版があります」と最新版へ誘導
 *
 * 純関数。遷移の妥当性検証と遷移結果の組み立て。
 * DB 更新は呼び出し側の責任。
 */

import type { CertificateState } from "@/lib/domain/states";
import { CERTIFICATE_TRANSITIONS, isValidTransition } from "@/lib/domain/transitions";

// ── 版遷移結果 ──

export type SupersedeResult = {
  /** 遷移は有効か。 */
  valid: boolean;
  /** 無効な場合の理由。 */
  reason?: string;
  /** 旧版の新しい状態。 */
  oldVersionState?: "SUPERSEDED";
  /** 新版の状態（再検証が完了したとき）。 */
  newVersionState?: "VERIFIED";
};

/**
 * 訂正完了による supersede 遷移を評価する。
 *
 * 前提:
 * - v1 は VERIFIED 状態でなければならない（遷移表: VERIFIED → SUPERSEDED）
 * - v2 は VERIFYING → VERIFIED を経る（再検証完了後に Current を切り替え）
 *
 * @param oldVersionState - 旧版（v1）の現在の状態
 * @returns 遷移結果
 */
export function evaluateSupersede(oldVersionState: CertificateState): SupersedeResult {
  if (!isValidTransition(CERTIFICATE_TRANSITIONS, oldVersionState, "SUPERSEDED")) {
    return {
      valid: false,
      reason: `状態 "${oldVersionState}" から SUPERSEDED への遷移は許可されていません。VERIFIED 状態の証明書のみ supersede 可能です。`,
    };
  }

  return {
    valid: true,
    oldVersionState: "SUPERSEDED",
    newVersionState: "VERIFIED",
  };
}

// ── Revoke 遷移 ──

export type RevokeResult = {
  valid: boolean;
  reason?: string;
  newState?: "REVOKED";
};

/**
 * revoke 遷移を評価する。
 *
 * @param currentState - 証明書の現在の状態
 * @returns 遷移結果
 */
export function evaluateRevoke(currentState: CertificateState): RevokeResult {
  if (!isValidTransition(CERTIFICATE_TRANSITIONS, currentState, "REVOKED")) {
    return {
      valid: false,
      reason: `状態 "${currentState}" から REVOKED への遷移は許可されていません。VERIFIED / ISSUING / VERIFYING 状態の証明書のみ revoke 可能です。`,
    };
  }

  return {
    valid: true,
    newState: "REVOKED",
  };
}

// ── 旧版誘導判定 ──

/**
 * 公開検証ページで旧版にアクセスされた場合の誘導情報を生成する。
 *
 * v2.0 §12.3: 旧 QR → 「新しい版があります」
 * v2.0 §12.4: REVOKED → 「この証明書は無効化されました」
 */
export type VersionRedirectInfo = {
  /** リダイレクトが必要か。 */
  shouldRedirect: boolean;
  /** 表示メッセージ。 */
  message?: string;
  /** リダイレクト先の public_id（SUPERSEDED の場合）。null = リダイレクト不要。 */
  redirectToPublicId?: string;
};

export function resolveVersionRedirect(state: CertificateState, latestPublicId?: string): VersionRedirectInfo {
  if (state === "SUPERSEDED") {
    return {
      shouldRedirect: true,
      message: "この証明書には新しい版があります。最新版をご確認ください。",
      // latestPublicId 省略時はキー自体を含めない（undefined を「リダイレクト先不明」と
      // 「リダイレクト先が空文字」で区別できなくする代入をしない）。
      ...(latestPublicId && { redirectToPublicId: latestPublicId }),
    };
  }

  if (state === "REVOKED") {
    return {
      shouldRedirect: false,
      message: "この証明書は無効化されました。",
    };
  }

  return { shouldRedirect: false };
}
