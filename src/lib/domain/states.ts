/**
 * 正準ドメイン状態語彙(IMP-001)。
 *
 * 出典: Ledra UI/UX & Development Specification v2.0 §19 / Appendix A。
 * 6軸(Job / Step / Severity / Certificate / Payment / Sync)は独立した関心事であり、
 * 1つの status カラムに混ぜない。新しいステータス文字列・遷移を追加する場合は、
 * 必ず本モジュールと __tests__ を先に更新すること(docs/adr/0002 参照)。
 *
 * 注意: これは v2.0 語彙の正準定義であり、稼働中の実装語彙
 * (例: reservations.status='confirmed'..., certificates.status='active'...)の
 * 置き換えではない。既存語彙との対応表は docs/implementation/requirement-trace.md §1。
 * 既存値→正準値のコード上のマッピングは意図的に持たない(対応が「部分/別方式」の軸で
 * 誤った同一視を焼き込まないため。状態機械を導入する IMP-015 で判断する)。
 */

function makeGuard<T extends string>(values: readonly T[]) {
  const set: ReadonlySet<string> = new Set(values);
  return (v: unknown): v is T => typeof v === "string" && set.has(v);
}

/** 案件(Job)の状態。v2.0 §19.1 */
export const JOB_STATES = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "PAUSED",
  "WAITING_REVIEW",
  "WAITING_CUSTOMER",
  "WAITING_PAYMENT",
  "CERTIFICATE_PROCESSING",
  "VERIFIED",
  "CANCELED",
  "NO_SHOW",
  "PARTIALLY_COMPLETED",
] as const;
export type JobState = (typeof JOB_STATES)[number];
export const isJobState = makeGuard(JOB_STATES);

/** 作業ステップの状態。v2.0 §19.2 */
export const STEP_STATES = [
  "NOT_STARTED",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_APPROVAL",
  "COMPLETED",
  "SKIPPED",
  "CANCELED",
] as const;
export type StepState = (typeof STEP_STATES)[number];
export const isStepState = makeGuard(STEP_STATES);

/** 緊急度。Issue 種別ではなく影響度の軸(v2.0 §5.4, §19.3) */
export const SEVERITIES = ["NORMAL", "ACTION", "HIGH", "CRITICAL", "RESOLVED"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const isSeverity = makeGuard(SEVERITIES);

/** 証明書の状態。v2.0 §12.2 */
export const CERTIFICATE_STATES = [
  "NOT_READY",
  "READY",
  "ISSUING",
  "VERIFYING",
  "VERIFIED",
  "PENDING_CORRECTION",
  "SUPERSEDED",
  "REVOKED",
] as const;
export type CertificateState = (typeof CERTIFICATE_STATES)[number];
export const isCertificateState = makeGuard(CERTIFICATE_STATES);

/**
 * 支払いの状態。v2.0 §11.2。
 * UNKNOWN は「結果不明」であり FAILED(失敗)とは別概念。UNKNOWN の間は
 * 再決済(盲目リトライ)をさせない(v2.0 §11.3)。
 */
export const PAYMENT_STATES = [
  "UNPAID",
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "OVERPAID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "CANCELED",
  "UNKNOWN",
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];
export const isPaymentState = makeGuard(PAYMENT_STATES);

/** 同期の状態。v2.0 §14.2 */
export const SYNC_STATES = ["SYNCED", "PENDING", "SYNCING", "FAILED", "CONFLICT"] as const;
export type SyncState = (typeof SYNC_STATES)[number];
export const isSyncState = makeGuard(SYNC_STATES);
