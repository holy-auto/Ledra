/**
 * 証明書訂正リクエスト型 & 評価器（IMP-030）。
 *
 * v2.0 §12.3 / ADR-0004:
 *   VERIFIED 済み証明書に誤りが判明 → 訂正リクエスト → 承認 → 訂正レコード
 *   → 再検証 → v1 を SUPERSEDED にし、v2 を VERIFIED にする。
 *
 * ここでは型定義と純関数の評価器のみ。DB マイグレーション・ルート変更なし。
 * 既存の certificate_edit_histories / certificate_versions はそのまま使う。
 */

import type { CertificateState } from "@/lib/domain/states";
import { isValidTransition } from "@/lib/domain/transitions";

// ── 訂正リクエスト状態 ──

export const CORRECTION_REQUEST_STATUSES = [
  "pending", // 訂正リクエスト提出済み、承認待ち
  "approved", // 承認済み、訂正実施可能
  "rejected", // 却下
  "applied", // 訂正適用済み（新版が ISSUING/VERIFYING/VERIFIED へ進行）
  "cancelled", // 取り消し
] as const;

export type CorrectionRequestStatus = (typeof CORRECTION_REQUEST_STATUSES)[number];

// ── 訂正カテゴリ ──

export const CORRECTION_CATEGORIES = [
  "content_error", // 内容の誤り（顧客名、車両情報、施工内容等）
  "measurement_error", // 計測値の誤り（膜厚等）
  "evidence_error", // 証跡の誤り（写真の取り違え等）
  "expiry_error", // 有効期限の誤り
  "other", // その他
] as const;

export type CorrectionCategory = (typeof CORRECTION_CATEGORIES)[number];

// ── 訂正リクエスト型 ──

export type CorrectionRequest = {
  id: string;
  certificateId: string;
  tenantId: string;
  /** 訂正対象の版番号。 */
  targetVersion: number;
  /** 訂正のカテゴリ。 */
  category: CorrectionCategory;
  /** 訂正理由（人間可読）。 */
  reason: string;
  /** 訂正する具体的なフィールドと新しい値。 */
  corrections: CorrectionField[];
  status: CorrectionRequestStatus;
  /** リクエスト者。 */
  requestedBy: string;
  requestedAt: string;
  /** 承認 / 却下者。 */
  reviewedBy?: string;
  reviewedAt?: string;
  /** 却下理由。 */
  rejectionReason?: string;
  /** 訂正適用後の新版番号。 */
  resultingVersion?: number;
};

export type CorrectionField = {
  field: string;
  /** UI 表示用ラベル。 */
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

// ── 訂正可否判定 ──

export type CorrectionEligibility = {
  eligible: boolean;
  /** 不可の場合の理由。 */
  reason?: string;
};

/**
 * 証明書が訂正可能かを判定する。
 *
 * v2.0 §12.3 ルール:
 * - VERIFIED のみ訂正可能（draft は通常の編集で対応、void/revoked は不可）
 * - 既に PENDING_CORRECTION がある場合は不可（二重訂正防止）
 * - SUPERSEDED は不可（旧版の訂正は無意味）
 */
export function evaluateCorrectionEligibility(
  certificateState: CertificateState,
  hasPendingCorrection: boolean,
): CorrectionEligibility {
  // VERIFIED のみ訂正可能
  if (certificateState !== "VERIFIED") {
    const reasons: Partial<Record<CertificateState, string>> = {
      NOT_READY: "証明書が発行準備中です。通常の編集で内容を修正してください。",
      READY: "証明書が発行準備中です。通常の編集で内容を修正してください。",
      ISSUING: "証明書が発行処理中です。完了後に訂正リクエストを提出してください。",
      VERIFYING: "証明書が検証中です。完了後に訂正リクエストを提出してください。",
      PENDING_CORRECTION: "訂正が進行中です。現在の訂正が完了するまでお待ちください。",
      SUPERSEDED: "この版は新しい版に置き換え済みです。最新版で操作してください。",
      REVOKED: "この証明書は無効化されています。訂正はできません。",
    };
    return {
      eligible: false,
      reason: reasons[certificateState] ?? "この状態では訂正できません。",
    };
  }

  if (hasPendingCorrection) {
    return {
      eligible: false,
      reason: "未処理の訂正リクエストがあります。完了後に再度リクエストしてください。",
    };
  }

  return { eligible: true };
}

// ── 訂正リクエスト状態遷移 ──

const CORRECTION_STATUS_TRANSITIONS: Record<CorrectionRequestStatus, readonly CorrectionRequestStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["applied", "cancelled"],
  rejected: [],
  applied: [],
  cancelled: [],
};

/**
 * 訂正リクエストの状態遷移が有効かを検証する。
 */
export function isValidCorrectionTransition(from: CorrectionRequestStatus, to: CorrectionRequestStatus): boolean {
  return isValidTransition(CORRECTION_STATUS_TRANSITIONS, from, to);
}

// ── 未処理訂正の有無判定（Certificate Gate 用） ──

/**
 * 訂正リクエストが「進行中」（発行ブロック対象）かを判定する。
 * pending または approved のリクエストがあれば、証明書の再発行をブロックする。
 *
 * Certificate Gate の no_pending_corrections 条件で使用。
 */
export function hasPendingOrApprovedCorrection(corrections: readonly { status: CorrectionRequestStatus }[]): boolean {
  return corrections.some((c) => c.status === "pending" || c.status === "approved");
}
