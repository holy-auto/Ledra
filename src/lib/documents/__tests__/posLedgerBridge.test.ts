import { describe, it, expect } from "vitest";
import { bridgePosToLedger, computeRefundRecording, type PosTransaction } from "../posLedgerBridge";

// ── ヘルパ ──

const mkTx = (overrides?: Partial<PosTransaction>): PosTransaction => ({
  id: "tx-1",
  tenantId: "tenant-1",
  documentId: "doc-1",
  reservationId: "res-1",
  customerId: "cust-1",
  amount: 50000,
  status: "completed",
  refundAmount: 0,
  provider: "stripe",
  providerTransactionId: "pi_123",
  paidAt: "2026-08-20T10:00:00Z",
  ...overrides,
});

// ── bridgePosToLedger ──

describe("bridgePosToLedger", () => {
  it("completed 取引 → entries に変換", () => {
    const result = bridgePosToLedger([mkTx()]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].amount).toBe(50000);
    expect(result.entries[0].paymentMethod).toBe("credit_card");
    expect(result.entries[0].referenceNo).toBe("pi_123");
    expect(result.entries[0].paymentDate).toBe("2026-08-20");
    expect(result.refundEntries).toHaveLength(0);
    expect(result.unbridgeable).toHaveLength(0);
  });

  it("documentId なし → unbridgeable", () => {
    const result = bridgePosToLedger([mkTx({ documentId: null })]);
    expect(result.entries).toHaveLength(0);
    expect(result.unbridgeable).toHaveLength(1);
  });

  it("voided → entries にも unbridgeable にも入らない", () => {
    const result = bridgePosToLedger([mkTx({ status: "voided" })]);
    expect(result.entries).toHaveLength(0);
    expect(result.refundEntries).toHaveLength(0);
    expect(result.unbridgeable).toHaveLength(0);
  });

  it("voided + documentId なし → unbridgeable ではなくスキップ", () => {
    const result = bridgePosToLedger([mkTx({ status: "voided", documentId: null })]);
    expect(result.entries).toHaveLength(0);
    expect(result.refundEntries).toHaveLength(0);
    expect(result.unbridgeable).toHaveLength(0);
  });

  it("refunded → entries + refundEntries の両方", () => {
    const result = bridgePosToLedger([mkTx({ status: "refunded", refundAmount: 50000 })]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].amount).toBe(50000);
    expect(result.refundEntries).toHaveLength(1);
    expect(result.refundEntries[0].refundAmount).toBe(50000);
    expect(result.refundEntries[0].referenceNo).toBe("refund-pi_123");
  });

  it("partial_refund → entries + refundEntries", () => {
    const result = bridgePosToLedger([mkTx({ status: "partial_refund", refundAmount: 20000 })]);
    expect(result.entries).toHaveLength(1);
    expect(result.refundEntries).toHaveLength(1);
    expect(result.refundEntries[0].refundAmount).toBe(20000);
  });

  it("プロバイダ別の PaymentMethod マッピング", () => {
    const providers = [
      { provider: "stripe", expected: "credit_card" },
      { provider: "square", expected: "credit_card" },
      { provider: "cash", expected: "cash" },
      { provider: "paypay", expected: "qr" },
      { provider: "linepay", expected: "qr" },
      { provider: "unknown_provider", expected: "other" },
    ] as const;

    for (const { provider, expected } of providers) {
      const result = bridgePosToLedger([mkTx({ provider })]);
      expect(result.entries[0].paymentMethod).toBe(expected);
    }
  });

  it("providerTransactionId なし → pos-{id} をフォールバック", () => {
    const result = bridgePosToLedger([mkTx({ providerTransactionId: null, id: "tx-99" })]);
    expect(result.entries[0].referenceNo).toBe("pos-tx-99");
  });

  it("documentId ありだが amount・refundAmount とも 0 以下 → unbridgeable（消えない）", () => {
    const result = bridgePosToLedger([mkTx({ amount: 0, refundAmount: 0 })]);
    expect(result.entries).toHaveLength(0);
    expect(result.refundEntries).toHaveLength(0);
    expect(result.unbridgeable).toHaveLength(1);
  });

  it("複数取引を一括処理", () => {
    const result = bridgePosToLedger([
      mkTx({ id: "1" }),
      mkTx({ id: "2", documentId: null }),
      mkTx({ id: "3", status: "voided" }),
      mkTx({ id: "4", status: "refunded", refundAmount: 10000 }),
    ]);
    expect(result.entries).toHaveLength(2); // #1 + #4
    expect(result.refundEntries).toHaveLength(1); // #4
    expect(result.unbridgeable).toHaveLength(1); // #2
    // #3 (voided) はどこにも入らない
  });
});

// ── computeRefundRecording ──

describe("computeRefundRecording", () => {
  it("negative_entry → payment_entries テーブルに負値", () => {
    const result = computeRefundRecording(10000, "negative_entry");
    expect(result.table).toBe("payment_entries");
    expect(result.amount).toBe(-10000);
  });

  it("separate_table → refund_entries テーブルに正値", () => {
    const result = computeRefundRecording(10000, "separate_table");
    expect(result.table).toBe("refund_entries");
    expect(result.amount).toBe(10000);
  });
});
