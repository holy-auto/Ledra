/**
 * イベント駆動オーケストレーションの「判定」層 (純関数のみ)。
 *
 * 「人がフォームを開かなくてもワークフローを前に進めてよいか」を、
 * テナント設定 (AiAutomationSettings) と抽出結果・文脈から決める。
 * 実際の DB 書き込み (IO) は inboundAuto.ts など呼び出し側が行う。
 *
 * 壁3 の遵守:
 *   - 金額確定 / 本人確認に触れる自動コミットはしない
 *     (新規顧客=本人の自動作成はしない / 金額は確定しない)
 *   - 証明書の「発行」は決して自動化しない (canAutoIssueCertificate は常に false)
 */

import { resolveAutoAction, type AiAutomationSettings } from "./policy";

/** YYYY-MM-DD の妥当な日付か (カレンダー的にも有効か) を検証する。 */
export function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ─────────────────────────────────────────────
// 受信メッセージ (LINE / メール) → 予約
// ─────────────────────────────────────────────

/**
 * 受信時に AI 抽出を自動実行してよいか。
 * 抽出は「提案を先回りで用意するだけ」でコミットしないため安全 (非壁3)。
 */
export function shouldAutoExtractInbound(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_extract");
}

export interface InboundExtractionLike {
  intent?: string | null;
  confidence?: number | null;
  scheduled_date?: string | null;
  customer_name?: string | null;
}

export interface InboundCommitContext {
  /** line_user_id 等から解決済みの既知顧客 ID。未知なら null。 */
  knownCustomerId: string | null;
}

export type InboundCommitReason =
  | "ok"
  | "auto_create_off"
  | "intent_not_new"
  | "low_confidence"
  | "unknown_customer"
  | "no_valid_date";

export interface InboundCommitDecision {
  /** 予約を自動起票してよいか。 */
  create: boolean;
  reason: InboundCommitReason;
}

/**
 * 抽出結果から「予約を自動起票してよいか」を判定する。
 *
 * すべて満たすときだけ create=true:
 *   1. auto_create_reservation が opt-in 済み (resolveAutoAction)
 *   2. intent === "new_reservation" (変更/キャンセル/問い合わせは自動起票しない)
 *   3. confidence ≥ confidenceThreshold
 *   4. 既知顧客に紐づく — 壁3: 新規顧客(本人)の自動作成はしない
 *   5. 有効な希望日 (YYYY-MM-DD) がある
 */
export function decideInboundCommit(
  settings: AiAutomationSettings,
  extraction: InboundExtractionLike,
  ctx: InboundCommitContext,
): InboundCommitDecision {
  if (!resolveAutoAction(settings, "inbound_message.auto_create_reservation")) {
    return { create: false, reason: "auto_create_off" };
  }
  const intent = (extraction.intent ?? "").toLowerCase();
  if (intent !== "new_reservation") {
    return { create: false, reason: "intent_not_new" };
  }
  const conf = typeof extraction.confidence === "number" ? extraction.confidence : 0;
  if (conf < settings.confidenceThreshold) {
    return { create: false, reason: "low_confidence" };
  }
  if (!ctx.knownCustomerId) {
    return { create: false, reason: "unknown_customer" };
  }
  if (!isValidYmd(extraction.scheduled_date)) {
    return { create: false, reason: "no_valid_date" };
  }
  return { create: true, reason: "ok" };
}

// ─────────────────────────────────────────────
// 証明書ドラフト / 発行
// ─────────────────────────────────────────────

export interface CertificateAutoDraftContext {
  hasPhotos: boolean;
  hasVoiceMemo: boolean;
}

/**
 * 案件の素材が揃った時点で証明書ドラフトを自動生成してよいか。
 * ドラフト生成のみ (発行はしない) なので安全。
 */
export function shouldAutoDraftCertificate(settings: AiAutomationSettings, ctx: CertificateAutoDraftContext): boolean {
  if (!resolveAutoAction(settings, "certificate.auto_draft")) return false;
  return ctx.hasPhotos && ctx.hasVoiceMemo;
}

/**
 * 壁3: 証明書の「発行」は法的責任を伴うため決して自動化しない。
 * NEVER_AUTO_ACTIONS により resolveAutoAction は常に false を返す。
 * (明示的に呼べるようにして、意図を tests/コードで固定する)
 */
export function canAutoIssueCertificate(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "certificate.auto_issue");
}
