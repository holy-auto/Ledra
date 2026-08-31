/**
 * IMP-028: Certificate Gate 単一評価器。
 *
 * v2.0 §19.4 / ADR-0005: 正式証明の発行可否（draft → active）は
 * 10 条件すべてを満たしたときのみ READY。バックエンド共通 Gate が唯一の判定源。
 * UI は結果を表示するだけで再計算・上書きしない。
 *
 * 純関数。IO なし — 呼び出し側が CertificateGateInput を組み立てて渡す。
 *
 * 条件のうち実装済みのもの:
 *   - required_evidence_present (photoRequirement)
 *   - payment_policy_met (IMP-027)
 *   - no_unresolved_alerts (IMP-026)
 *
 * 残りはデフォルト met:true のスタブ。後続タスクが実装時にここへ追加する。
 */

import type { GateConditionResult, CertificateGateResult } from "@/lib/domain/certificateGate";
import {
  MIN_CERTIFICATE_PHOTOS,
  CERTIFICATE_PHOTO_REQUIRED_MESSAGE,
  CERTIFICATE_BEFORE_AFTER_REQUIRED_MESSAGE,
  requiresBeforeAfterMedia,
} from "./photoRequirement";
import { hasPendingOrApprovedCorrection, type CorrectionRequestStatus } from "./correction";

// ── 評価器の入力コンテキスト ──

/** 評価器に渡す、事前取得済みのデータ。 */
export type CertificateGateInput = {
  // ── required_evidence_present ──
  /** 証明書に紐づく施工写真の枚数。 */
  photoCount: number;
  /** Before/After メディアがあるか（コーティング・PPF 用）。 */
  hasBeforeAfterMedia: boolean;
  /** 証明書の service_type（コーティング・PPF で Before/After を要求）。 */
  serviceType: string | null;

  // ── payment_policy_met (IMP-027) ──
  /** evaluatePaymentPolicy() の結果。null = 支払いデータなし（条件スキップ）。 */
  paymentPolicyResult: { met: boolean; reason?: string } | null;

  // ── no_unresolved_alerts (IMP-026) ──
  /** hasUnresolvedConcerns() の結果。 */
  hasUnresolvedConcerns: boolean;

  // ── 将来条件（デフォルト true のスタブ） ──
  /** ワークフロー完了。デフォルト true（既存 signoff state machine に委ねる）。 */
  workflowCompleted?: boolean;
  /** 証跡が同期済み。デフォルト true（IMP-016 オフライン同期後に実装）。 */
  evidenceSynced?: boolean;
  /** 部品整合性 OK。デフォルト true（部品がない場合も true）。 */
  partsIntegrityOk?: boolean;
  /** 店舗内レビュー完了。デフォルト true（未設計）。 */
  inStoreReviewDone?: boolean;
  /** 顧客確認が最新版。デフォルト true（受領サイン・部品確認は別系統で管理）。 */
  customerConfirmationCurrent?: boolean;
  /** 未処理訂正なし。訂正リクエスト一覧を渡す。空配列 or 省略 = 訂正なし（通過）。 */
  correctionRequests?: readonly { status: CorrectionRequestStatus }[];
  /** @deprecated noPendingCorrections の直接指定。correctionRequests が優先。 */
  noPendingCorrections?: boolean;
  /** 必要承認完了。デフォルト true（未設計）。 */
  approvalsComplete?: boolean;
};

// ── 評価器本体 ──

/**
 * Certificate Gate の 10 条件を一括評価する。
 *
 * @returns ready = true ⇔ すべての conditions が met: true
 */
export function evaluateCertificateGate(input: CertificateGateInput): CertificateGateResult {
  const conditions: GateConditionResult[] = [
    evaluateWorkflowCompleted(input),
    evaluateRequiredEvidence(input),
    evaluateEvidenceSynced(input),
    evaluatePartsIntegrity(input),
    evaluateInStoreReview(input),
    evaluateCustomerConfirmation(input),
    evaluatePaymentPolicy(input),
    evaluateNoPendingCorrections(input),
    evaluateNoUnresolvedAlerts(input),
    evaluateApprovalsComplete(input),
  ];

  return {
    ready: conditions.every((c) => c.met),
    conditions,
  };
}

// ── 個別条件の評価 ──

function evaluateWorkflowCompleted(input: CertificateGateInput): GateConditionResult {
  // ponytail: 既存 signoff state machine に委ねる。将来は signoff 結果を input に含める。
  const met = input.workflowCompleted ?? true;
  return {
    condition: "workflow_completed",
    met,
    ...(!met && { detail: "ワークフローが完了していません。" }),
  };
}

function evaluateRequiredEvidence(input: CertificateGateInput): GateConditionResult {
  // 最低1枚の施工写真
  if (input.photoCount < MIN_CERTIFICATE_PHOTOS) {
    return {
      condition: "required_evidence_present",
      met: false,
      detail: CERTIFICATE_PHOTO_REQUIRED_MESSAGE,
    };
  }

  // コーティング・PPF は Before/After メディアも必須（一覧は photoRequirement.ts を単一定義源とする）
  if (requiresBeforeAfterMedia(input.serviceType) && !input.hasBeforeAfterMedia) {
    return {
      condition: "required_evidence_present",
      met: false,
      detail: CERTIFICATE_BEFORE_AFTER_REQUIRED_MESSAGE,
    };
  }

  return { condition: "required_evidence_present", met: true };
}

function evaluateEvidenceSynced(input: CertificateGateInput): GateConditionResult {
  // ponytail: IMP-016 オフライン同期後に実装。現在は常に同期済みとみなす。
  const met = input.evidenceSynced ?? true;
  return {
    condition: "evidence_synced",
    met,
    ...(!met && { detail: "証跡データの同期が完了していません。" }),
  };
}

function evaluatePartsIntegrity(input: CertificateGateInput): GateConditionResult {
  // ponytail: 部品が存在しない場合は true。部品整合性チェックは既存 src/lib/parts/ を使用。
  const met = input.partsIntegrityOk ?? true;
  return {
    condition: "parts_integrity",
    met,
    ...(!met && { detail: "部品の整合性チェックが通過していません。" }),
  };
}

function evaluateInStoreReview(input: CertificateGateInput): GateConditionResult {
  // ponytail: 店舗内レビュー機能は未設計。常に通過。
  const met = input.inStoreReviewDone ?? true;
  return {
    condition: "in_store_review",
    met,
    ...(!met && { detail: "店舗内レビューが完了していません。" }),
  };
}

function evaluateCustomerConfirmation(input: CertificateGateInput): GateConditionResult {
  // ponytail: 受領サイン・部品確認は別系統（signoff state machine）で管理。
  const met = input.customerConfirmationCurrent ?? true;
  return {
    condition: "customer_confirmation_current",
    met,
    ...(!met && { detail: "顧客確認が最新版ではありません。" }),
  };
}

function evaluatePaymentPolicy(input: CertificateGateInput): GateConditionResult {
  // null = 支払いデータなし（証明書に紐づく請求/決済がない場合）→ 条件スキップ
  if (!input.paymentPolicyResult) {
    return { condition: "payment_policy_met", met: true };
  }

  return {
    condition: "payment_policy_met",
    met: input.paymentPolicyResult.met,
    ...(!input.paymentPolicyResult.met && {
      detail: input.paymentPolicyResult.reason ?? "支払い条件が未達成です。",
    }),
  };
}

function evaluateNoPendingCorrections(input: CertificateGateInput): GateConditionResult {
  // correctionRequests が渡されていればそちらで判定、なければ直接フラグ or デフォルト true
  const hasPending = input.correctionRequests
    ? hasPendingOrApprovedCorrection(input.correctionRequests)
    : !(input.noPendingCorrections ?? true);

  return {
    condition: "no_pending_corrections",
    met: !hasPending,
    ...(hasPending && { detail: "未処理の訂正依頼があります。訂正完了後に発行してください。" }),
  };
}

function evaluateNoUnresolvedAlerts(input: CertificateGateInput): GateConditionResult {
  return {
    condition: "no_unresolved_alerts",
    met: !input.hasUnresolvedConcerns,
    ...(input.hasUnresolvedConcerns && {
      detail: "未解決の顧客懸念があります。対応後に発行してください。",
    }),
  };
}

function evaluateApprovalsComplete(input: CertificateGateInput): GateConditionResult {
  // ponytail: 承認機能は未設計。常に通過。
  const met = input.approvalsComplete ?? true;
  return {
    condition: "approvals_complete",
    met,
    ...(!met && { detail: "必要な承認が完了していません。" }),
  };
}
