/**
 * 正準ドメイン状態のロケール別 UI ラベル(IMP-001)。
 *
 * ドメインコード(大文字の正準値)は翻訳・表示の都合で変更しない。表示文言は
 * このラベルマップだけを差し替える(v2.0 §17、docs/adr/0002)。
 * ja のラベルは v2.0 Appendix A の表記に従う。PaymentState は Appendix A に無いため
 * §11.2 の Meaning 列を基にし、PENDING・PAID・UNKNOWN は表示用に短縮した
 * (「処理中 / 確認中」→「処理中」等。意味論の正はコードコメントと ADR 側)。
 * StepState / SyncState は仕様書に UI ラベルの定義がないため、本実装で定めた
 * (仕様引用ではない)。
 *
 * ponytail: 収録ロケールは当面 ja/en の2つ。6言語(vi/id/fil/hi 追加)と翻訳キー化・
 * フォールバック規則の整備は IMP-011 で行い、その際に本マップは i18n 基盤へ載せ替え可。
 */
import type { CertificateState, JobState, PaymentState, Severity, StepState, SyncState } from "./states";

/** v2.0 §17.1 の初期重点6言語。ラベル未収録のロケールは ja にフォールバックする。 */
export const DOMAIN_LOCALES = ["ja", "en", "vi", "id", "fil", "hi"] as const;
export type DomainLocale = (typeof DOMAIN_LOCALES)[number];
export const DEFAULT_DOMAIN_LOCALE: DomainLocale = "ja";

type LabelMaps<T extends string> = { readonly ja: Record<T, string> } & Partial<
  Record<DomainLocale, Record<T, string>>
>;

const JOB_STATE_LABELS: LabelMaps<JobState> = {
  ja: {
    SCHEDULED: "予定",
    CHECKED_IN: "入庫済み",
    IN_PROGRESS: "作業中",
    PAUSED: "中断中",
    WAITING_REVIEW: "確認待ち",
    WAITING_CUSTOMER: "顧客確認待ち",
    WAITING_PAYMENT: "決済待ち",
    CERTIFICATE_PROCESSING: "証明処理中",
    VERIFIED: "完了 / VERIFIED",
    CANCELED: "キャンセル",
    NO_SHOW: "来店なし",
    PARTIALLY_COMPLETED: "部分終了",
  },
  en: {
    SCHEDULED: "Scheduled",
    CHECKED_IN: "Checked in",
    IN_PROGRESS: "In progress",
    PAUSED: "Paused",
    WAITING_REVIEW: "Awaiting review",
    WAITING_CUSTOMER: "Awaiting customer",
    WAITING_PAYMENT: "Awaiting payment",
    CERTIFICATE_PROCESSING: "Certificate processing",
    VERIFIED: "VERIFIED",
    CANCELED: "Canceled",
    NO_SHOW: "No-show",
    PARTIALLY_COMPLETED: "Partially completed",
  },
};

const STEP_STATE_LABELS: LabelMaps<StepState> = {
  ja: {
    NOT_STARTED: "未着手",
    READY: "開始可能",
    IN_PROGRESS: "作業中",
    BLOCKED: "ブロック中",
    WAITING_APPROVAL: "承認待ち",
    COMPLETED: "完了",
    SKIPPED: "スキップ",
    CANCELED: "キャンセル",
  },
  en: {
    NOT_STARTED: "Not started",
    READY: "Ready",
    IN_PROGRESS: "In progress",
    BLOCKED: "Blocked",
    WAITING_APPROVAL: "Awaiting approval",
    COMPLETED: "Completed",
    SKIPPED: "Skipped",
    CANCELED: "Canceled",
  },
};

const SEVERITY_LABELS: LabelMaps<Severity> = {
  ja: {
    NORMAL: "通常",
    ACTION: "要対応",
    HIGH: "高",
    CRITICAL: "緊急",
    RESOLVED: "解消",
  },
  en: {
    NORMAL: "Normal",
    ACTION: "Action needed",
    HIGH: "High",
    CRITICAL: "Critical",
    RESOLVED: "Resolved",
  },
};

const CERTIFICATE_STATE_LABELS: LabelMaps<CertificateState> = {
  ja: {
    NOT_READY: "未準備",
    READY: "発行条件成立",
    ISSUING: "発行中",
    VERIFYING: "検証中",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "訂正確認中",
    SUPERSEDED: "新しい版あり",
    REVOKED: "無効",
  },
  en: {
    NOT_READY: "Not ready",
    READY: "Ready",
    ISSUING: "Issuing",
    VERIFYING: "Verifying",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "Correction pending",
    SUPERSEDED: "Superseded",
    REVOKED: "Revoked",
  },
};

const PAYMENT_STATE_LABELS: LabelMaps<PaymentState> = {
  ja: {
    UNPAID: "未入金",
    PENDING: "処理中",
    PARTIALLY_PAID: "一部入金",
    PAID: "入金完了",
    OVERPAID: "過入金",
    REFUNDED: "全額返金",
    PARTIALLY_REFUNDED: "一部返金",
    CANCELED: "取消",
    UNKNOWN: "結果不明",
  },
  en: {
    UNPAID: "Unpaid",
    PENDING: "Pending",
    PARTIALLY_PAID: "Partially paid",
    PAID: "Paid",
    OVERPAID: "Overpaid",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
    CANCELED: "Canceled",
    UNKNOWN: "Unknown",
  },
};

const SYNC_STATE_LABELS: LabelMaps<SyncState> = {
  ja: {
    SYNCED: "同期済み",
    PENDING: "同期待ち",
    SYNCING: "同期中",
    FAILED: "同期失敗",
    CONFLICT: "競合",
  },
  en: {
    SYNCED: "Synced",
    PENDING: "Pending",
    SYNCING: "Syncing",
    FAILED: "Failed",
    CONFLICT: "Conflict",
  },
};

function pick<T extends string>(maps: LabelMaps<T>, code: T, locale: DomainLocale): string {
  // 型を欺いて legacy 値等が渡された場合に「undefined」を描画せず、コードをそのまま返す
  // (statusMaps.ts の getStatusEntry と同じ境界防御)
  return (maps[locale] ?? maps.ja)[code] ?? code;
}

export const jobStateLabel = (s: JobState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(JOB_STATE_LABELS, s, locale);
export const stepStateLabel = (s: StepState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(STEP_STATE_LABELS, s, locale);
export const severityLabel = (s: Severity, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(SEVERITY_LABELS, s, locale);
export const certificateStateLabel = (s: CertificateState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(CERTIFICATE_STATE_LABELS, s, locale);
export const paymentStateLabel = (s: PaymentState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(PAYMENT_STATE_LABELS, s, locale);
export const syncStateLabel = (s: SyncState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(SYNC_STATE_LABELS, s, locale);

/** テスト用に全マップを公開(アプリコードからは個別の *Label 関数を使うこと)。 */
export const __DOMAIN_LABEL_MAPS = {
  job: JOB_STATE_LABELS,
  step: STEP_STATE_LABELS,
  severity: SEVERITY_LABELS,
  certificate: CERTIFICATE_STATE_LABELS,
  payment: PAYMENT_STATE_LABELS,
  sync: SYNC_STATE_LABELS,
} as const;
