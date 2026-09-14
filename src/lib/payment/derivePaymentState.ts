/**
 * IMP-027: 既存の支払いデータから正準 PaymentState を導出する。
 *
 * v2.0 §11.2 の 9 状態を、既存の documents.status / payment_entries /
 * payments テーブルのデータから計算する。DB カラムの追加・変更は行わない。
 *
 * ponytail: 純関数、IO なし。消費側が Supabase から取得した数値を渡す。
 */

import type { PaymentState } from "@/lib/domain/states";
import type { DocumentPaymentContext, PosPaymentContext } from "./types";

/**
 * 帳票の支払い状態を正準 PaymentState に導出する。
 *
 * 導出ロジック:
 * 1. cancelled/rejected → CANCELED
 * 2. draft             → UNPAID（まだ請求していない）
 * 3. pendingAsync      → PENDING（Stripe/Square 等で決済処理中）
 * 4. refunded > 0 かつ paid - refunded ≤ 0 → REFUNDED
 * 5. refunded > 0 かつ paid - refunded > total → OVERPAID（返金後もまだ過入金）
 * 5b. refunded > 0 かつ 0 < paid - refunded ≤ total → PARTIALLY_REFUNDED
 * 6. paid > total      → OVERPAID
 * 7. paid === total    → PAID
 * 8. paid > 0          → PARTIALLY_PAID
 * 9. total <= 0        → PAID（無料サービス・クレジットノート等は自動的に支払い済み扱い）
 * 10. overdue          → UNPAID（未入金だが期限超過。PaymentState に overdue はない）
 * 11. sent/accepted    → UNPAID
 */
export function deriveDocumentPaymentState(ctx: DocumentPaymentContext): PaymentState {
  const { documentStatus, total, paid, refunded, pendingAsync } = ctx;

  // 取消系
  if (documentStatus === "cancelled" || documentStatus === "rejected") return "CANCELED";

  // 下書き — まだ請求していない
  if (documentStatus === "draft") return "UNPAID";

  // 非同期決済の処理中
  if (pendingAsync) return "PENDING";

  // 返金が発生している場合
  if (refunded > 0) {
    const netPaid = paid - refunded;
    if (netPaid <= 0) return "REFUNDED";
    // 返金後もまだ過入金 → OVERPAID が優先（返金不足の検出用）
    if (total > 0 && netPaid > total) return "OVERPAID";
    return "PARTIALLY_REFUNDED";
  }

  // 入金額と合計額の比較
  if (total > 0) {
    if (paid > total) return "OVERPAID";
    if (paid >= total) return "PAID";
    if (paid > 0) return "PARTIALLY_PAID";
  } else if (total <= 0) {
    // 合計 0 以下の帳票（無料サービス・クレジットノート等）は自動的に PAID
    return "PAID";
  }

  // 未入金
  return "UNPAID";
}

/**
 * POS 取引の支払い状態を正準 PaymentState に導出する。
 */
export function derivePoSPaymentState(ctx: PosPaymentContext): PaymentState {
  switch (ctx.status) {
    case "completed":
      // 全額返金済みだがステータス未更新の場合を考慮
      if (ctx.refundAmount > 0 && ctx.refundAmount >= ctx.amount) return "REFUNDED";
      return ctx.refundAmount > 0 ? "PARTIALLY_REFUNDED" : "PAID";
    case "refunded":
      return "REFUNDED";
    case "partial_refund":
      return "PARTIALLY_REFUNDED";
    case "voided":
      return "CANCELED";
    default: {
      // ponytail: PosPaymentStatus 拡張時に未処理値をコンパイル時に検出
      const _exhaustive: never = ctx.status;
      return _exhaustive;
    }
  }
}

/**
 * reservations.payment_status を正準 PaymentState に導出する。
 *
 * ponytail: 予約の payment_status は粗い（4 値 + null）ため、
 * 正確な導出には帳票データが必要。これは簡易変換。
 */
export function deriveReservationPaymentState(paymentStatus: string | null): PaymentState {
  switch (paymentStatus) {
    case "paid":
      return "PAID";
    case "partial":
      return "PARTIALLY_PAID";
    case "refunded":
      return "REFUNDED";
    case "unpaid":
      return "UNPAID";
    default:
      // null / 未設定 — 支払い状態が未追跡
      return "UNPAID";
  }
}
