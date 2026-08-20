/**
 * Integrity Incident 型 & revoke 評価器（IMP-030）。
 *
 * v2.0 §12.4 / ADR-0004:
 *   重大な問題（改ざん発覚・法的要請・重大過誤）が判明した場合、
 *   証明書を REVOKED にし、「無効化された事実」を第三者が確認できる
 *   形で公開する。既存の void は tenant 側の日常操作（取り下げ）。
 *   REVOKED は不正・改ざんなど重大問題のための公式無効化。
 *
 * 純関数・型定義のみ。DB マイグレーション・ルート変更なし。
 */

import type { CertificateState } from "@/lib/domain/states";

// ── Incident カテゴリ ──

export const INCIDENT_CATEGORIES = [
  "tampering", // 改ざん（写真・データ・ハッシュ不整合）
  "fraud", // 詐欺・不正（架空施工、虚偽記載）
  "legal_request", // 法的要請（裁判所命令等）
  "gross_negligence", // 重大過誤（施工不良の隠蔽等）
  "evidence_compromise", // 証跡の信頼性毀損（署名鍵漏洩等）
  "other", // その他
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

// ── Incident 重大度 ──

export const INCIDENT_SEVERITIES = [
  "critical", // 即時 revoke 必須
  "high", // 調査後 revoke 可能性大
  "medium", // 調査中、revoke は判断保留
] as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

// ── Incident 状態 ──

export const INCIDENT_STATUSES = [
  "reported", // 報告済み
  "investigating", // 調査中
  "confirmed", // 確認済み（revoke 執行可能）
  "revoked", // revoke 執行済み
  "dismissed", // 棄却（問題なし）
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

// ── Integrity Incident 型 ──

export type IntegrityIncident = {
  id: string;
  certificateId: string;
  tenantId: string;
  /** 対象の証明書 public_id（公開検証ページ用）。 */
  certificatePublicId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  /** 問題の詳細説明。 */
  description: string;
  /** 証拠（ハッシュ不整合の詳細、スクリーンショット参照等）。 */
  evidence?: string;
  /** 報告者。 */
  reportedBy: string;
  reportedAt: string;
  /** 調査担当者。 */
  investigator?: string;
  /** 確認 / 棄却日時。 */
  resolvedAt?: string;
  resolvedBy?: string;
  /** revoke 実行日時。 */
  revokedAt?: string;
  /** 公開理由（第三者が検証ページで見る無効化理由）。 */
  publicReason?: string;
};

// ── Revoke 可否判定 ──

export type RevokeEligibility = {
  eligible: boolean;
  reason?: string;
};

/**
 * 証明書が revoke 可能かを判定する。
 *
 * v2.0 §12.4 ルール:
 * - VERIFIED のみ revoke 可能（draft/ready 段階は削除で対応）
 * - 既に REVOKED は不可
 * - SUPERSEDED は不可（旧版は既に最新版に置き換え済み）
 *
 * ponytail: void（既存の日常取り下げ）との違いは重大度。
 * revoke は Integrity Incident に紐づく公式無効化で、公開検証ページに
 * 「この証明書は無効化されました」と表示される。
 */
export function evaluateRevokeEligibility(certificateState: CertificateState): RevokeEligibility {
  if (certificateState === "VERIFIED") {
    return { eligible: true };
  }

  const reasons: Record<string, string> = {
    NOT_READY: "発行準備中の証明書は revoke ではなく削除で対応してください。",
    READY: "発行準備中の証明書は revoke ではなく削除で対応してください。",
    ISSUING: "発行処理中です。完了後に revoke を検討してください。",
    VERIFYING: "検証中です。完了後に revoke を検討してください。",
    PENDING_CORRECTION: "訂正処理中です。訂正完了後に revoke を検討してください。",
    SUPERSEDED: "この版は既に新しい版に置き換え済みです。最新版で操作してください。",
    REVOKED: "この証明書は既に無効化されています。",
  };

  return {
    eligible: false,
    reason: reasons[certificateState] ?? "この状態では revoke できません。",
  };
}

// ── Incident 状態遷移 ──

const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  reported: ["investigating", "confirmed", "dismissed"],
  investigating: ["confirmed", "dismissed"],
  confirmed: ["revoked"],
  revoked: [],
  dismissed: [],
};

/**
 * Incident の状態遷移が有効かを検証する。
 */
export function isValidIncidentTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_STATUS_TRANSITIONS[from].includes(to);
}

// ── 即時 revoke 判定 ──

/**
 * Incident の severity と category から即時 revoke が必要かを判定する。
 *
 * critical severity は全カテゴリで即時 revoke。
 * tampering + high も即時 revoke（改ざんは高確度で即時対応）。
 */
export function requiresImmediateRevoke(severity: IncidentSeverity, category: IncidentCategory): boolean {
  if (severity === "critical") return true;
  if (severity === "high" && category === "tampering") return true;
  return false;
}
