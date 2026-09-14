/**
 * IMP-043: POS → 売掛元帳ブリッジ。
 *
 * 現状: POS 決済（payments テーブル）と売掛元帳（payment_entries テーブル）は
 * 別系統。Stripe webhook → recordInvoicePaymentBalance() は帳票経由の入金のみ対応。
 * Square 等の POS 取引や現金取引を元帳に反映する仕組みがない。
 *
 * 本モジュールは POS → 元帳のマッピング純関数を提供する。
 * 実際の DB 書込み・webhook 統合は消費タスクで実施。
 *
 * ponytail: 純関数のみ。IO なし。recordPayment.ts の PaymentMethod を再利用。
 */

import type { PaymentMethod } from "@/lib/invoice/recordPayment";

// ── 型 ──

/** POS 取引レコード（payments テーブルの値から必要なフィールドのみ）。 */
export interface PosTransaction {
  id: string;
  tenantId: string;
  /** 紐付く帳票 ID（nullable — POS 直接決済は帳票なしの場合あり）。 */
  documentId: string | null;
  /** 紐付く予約 ID。 */
  reservationId: string | null;
  customerId: string | null;
  amount: number;
  /** POS のステータス。 */
  status: "completed" | "refunded" | "partial_refund" | "voided";
  /** 返金額。 */
  refundAmount: number;
  /** 決済プロバイダ。 */
  provider: string;
  /** プロバイダの取引 ID（冪等性キー）。 */
  providerTransactionId: string | null;
  /** 決済日時。 */
  paidAt: string;
}

/** 元帳エントリの入力形式（recordInvoicePaymentBalance のパラメータに近い形）。 */
export interface LedgerEntryInput {
  tenantId: string;
  documentId: string;
  customerId: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNo: string;
  notes: string;
}

/** 返金元帳エントリの入力形式。 */
export interface RefundLedgerEntryInput {
  tenantId: string;
  documentId: string;
  customerId: string | null;
  /** 返金額（正の値）。消費側で負値として記帳するかは DB 設計による。 */
  refundAmount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNo: string;
  notes: string;
}

/** ブリッジ結果。 */
export interface PosBridgeResult {
  /** 作成すべき入金エントリ。documentId がある取引のみ。 */
  entries: LedgerEntryInput[];
  /** 作成すべき返金エントリ。 */
  refundEntries: RefundLedgerEntryInput[];
  /** 帳票なしの取引（元帳に記帳できない）。 */
  unbridgeable: PosTransaction[];
}

// ── 純関数 ──

/** POS プロバイダ名 → PaymentMethod のマッピング。 */
function mapProviderToMethod(provider: string): PaymentMethod {
  switch (provider.toLowerCase()) {
    case "stripe":
    case "square":
      return "credit_card";
    case "cash":
      return "cash";
    case "bank_transfer":
      return "bank_transfer";
    case "paypay":
    case "linepay":
    case "merpay":
      return "qr";
    default:
      return "other";
  }
}

/**
 * POS 取引の配列を売掛元帳エントリに変換する。
 *
 * - documentId がない取引は unbridgeable に分類
 * - voided 取引は無視（元帳に反映しない）
 * - refunded / partial_refund は refundEntries に分類
 * - completed は entries に分類
 * - documentId はあるが amount・refundAmount とも 0 以下（データ不備）は unbridgeable に分類
 *
 * 冪等性: providerTransactionId を referenceNo として渡す。
 * 消費側の recordInvoicePaymentBalance が同一 reference_no の重複記帳を防止する。
 */
export function bridgePosToLedger(transactions: readonly PosTransaction[]): PosBridgeResult {
  const entries: LedgerEntryInput[] = [];
  const refundEntries: RefundLedgerEntryInput[] = [];
  const unbridgeable: PosTransaction[] = [];

  for (const tx of transactions) {
    // voided → 元帳に反映しない（取消済み）— documentId チェックより先
    if (tx.status === "voided") continue;

    // 帳票なし → 元帳に記帳不可
    if (!tx.documentId) {
      unbridgeable.push(tx);
      continue;
    }

    const method = mapProviderToMethod(tx.provider);
    const date = tx.paidAt.slice(0, 10); // ISO → YYYY-MM-DD
    const refNo = tx.providerTransactionId ?? `pos-${tx.id}`;

    // 入金エントリ（completed / refunded / partial_refund すべてに元の入金がある）
    if (tx.amount > 0) {
      entries.push({
        tenantId: tx.tenantId,
        documentId: tx.documentId,
        customerId: tx.customerId,
        amount: tx.amount,
        paymentMethod: method,
        paymentDate: date,
        referenceNo: refNo,
        notes: `POS (${tx.provider})`,
      });
    }

    // 返金エントリ
    if (tx.refundAmount > 0) {
      refundEntries.push({
        tenantId: tx.tenantId,
        documentId: tx.documentId,
        customerId: tx.customerId,
        refundAmount: tx.refundAmount,
        paymentMethod: method,
        paymentDate: date,
        referenceNo: `refund-${refNo}`,
        notes: `POS 返金 (${tx.provider})`,
      });
    }

    // amount・refundAmount とも 0 以下（payments.amount に amount>0 の CHECK 制約はない）
    // → entries にも refundEntries にも入らず消えてしまうデータ不備。unbridgeable で拾う。
    if (tx.amount <= 0 && tx.refundAmount <= 0) {
      unbridgeable.push(tx);
    }
  }

  return { entries, refundEntries, unbridgeable };
}

/**
 * 返金額を元帳に記帳可能な形式に変換する。
 *
 * 現行 payment_entries は CHECK (amount > 0) なので負値は入らない。
 * 返金を元帳に反映する方法は 2 通り:
 * (a) amount CHECK を外して負値を許可する（DB マイグレーション）
 * (b) refund_entries 別テーブルを作る
 *
 * 本関数はどちらの方式でも対応できるよう、正の返金額と方式フラグを返す。
 * DB 設計の決定は消費タスク。
 *
 * ponytail: 返金の帳簿記帳方式は DB 設計で決定。ここでは純関数として選択肢を提供。
 */
export type RefundRecordingStrategy = "negative_entry" | "separate_table";

export function computeRefundRecording(
  refundAmount: number,
  strategy: RefundRecordingStrategy,
): { table: "payment_entries" | "refund_entries"; amount: number } {
  if (strategy === "negative_entry") {
    return { table: "payment_entries", amount: -refundAmount };
  }
  return { table: "refund_entries", amount: refundAmount };
}
