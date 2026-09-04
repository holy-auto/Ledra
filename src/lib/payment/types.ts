/**
 * IMP-027: 支払いモデル型定義。
 *
 * 正準 PaymentState（states.ts）と既存実装語彙（documents.status,
 * payments.status, reservations.payment_status）の橋渡し。
 *
 * ponytail: 型と純関数のみ。DB マイグレーション・UI 変更は IMP-043 に委ねる。
 */

import type { PaymentState } from "@/lib/domain/states";

// ── 既存実装語彙の型化 ──

/** documents.status（DB CHECK 制約と一致）。 */
export type DocumentStatus = "draft" | "sent" | "accepted" | "paid" | "overdue" | "rejected" | "cancelled";

/** payments.status（POS payments テーブル）。 */
export type PosPaymentStatus = "completed" | "refunded" | "partial_refund" | "voided";

/** reservations.payment_status（予約の支払い状態）。 */
export type ReservationPaymentStatus = "unpaid" | "paid" | "partial" | "refunded" | null;

// ── 支払い文脈（状態導出の入力） ──

/**
 * 帳票ベースの支払い状態導出に必要なコンテキスト。
 *
 * 消費側（API / UI）が DB から取得した値をそのまま渡す。
 * total / paid は帳票合計額と入金済み額。refunded は返金済み額。
 */
export interface DocumentPaymentContext {
  /** documents.status */
  documentStatus: DocumentStatus;
  /** documents.total（税込合計額、整数）。 */
  total: number;
  /** SUM(payment_entries.amount) — 入金額合計。 */
  paid: number;
  /** 返金額合計（payments テーブルの refund_amount 合計、または 0）。 */
  refunded: number;
  /** Stripe/Square 等の非同期決済が未確定か。 */
  pendingAsync?: boolean;
}

/**
 * POS 取引の支払い状態導出コンテキスト。
 */
export interface PosPaymentContext {
  status: PosPaymentStatus;
  amount: number;
  refundAmount: number;
}

// ── 支払いポリシー（Certificate Gate 条件） ──

/**
 * v2.0 §11.3 の 3 ポリシー。
 *
 * - consumer: 個人顧客。証明書発行前に PAID であること。
 * - b2b:      法人・合算払い。支払い条件の充足（consolidated → 自動承認）。
 * - insurance: 保険請求。保険会社承認がある場合の支払い扱い。
 *
 * ponytail: insurance は Phase 2。consumer / b2b を先行実装。
 */
export type PaymentPolicy = "consumer" | "b2b" | "insurance";

/** 顧客区分（signoff/state.ts の CustomerType と同一だが依存を避けて再宣言）。 */
export type CustomerType = "individual" | "corporate";

/** 法人の支払いサイクル（signoff/state.ts の BillingCycle と同一）。 */
export type BillingCycle = "per_job" | "consolidated";

/**
 * Payment Policy 評価に必要なコンテキスト。
 */
export interface PaymentPolicyContext {
  customerType: CustomerType;
  billingCycle: BillingCycle | null;
  /** 現在の支払い状態（canonical PaymentState）。 */
  paymentState: PaymentState;
  /** 保険請求で保険会社が承認済みか（insurance ポリシー用、Phase 2）。 */
  insurerApproved?: boolean;
}

/**
 * Payment Policy 評価結果。
 *
 * met = true なら Certificate Gate の payment_policy_met 条件を満たす。
 */
export interface PaymentPolicyResult {
  policy: PaymentPolicy;
  met: boolean;
  /** 不足時の理由（UI / Gate の detail に使用）。 */
  reason?: string;
}
