import { describe, it, expect } from "vitest";
import {
  deriveDocumentPaymentState,
  derivePoSPaymentState,
  deriveReservationPaymentState,
} from "../derivePaymentState";
import type { DocumentPaymentContext, PosPaymentContext } from "../types";

describe("deriveDocumentPaymentState", () => {
  const base: DocumentPaymentContext = { documentStatus: "sent", total: 10000, paid: 0, refunded: 0 };

  it("cancelled → CANCELED", () => {
    expect(deriveDocumentPaymentState({ ...base, documentStatus: "cancelled" })).toBe("CANCELED");
  });

  it("rejected → CANCELED", () => {
    expect(deriveDocumentPaymentState({ ...base, documentStatus: "rejected" })).toBe("CANCELED");
  });

  it("draft → UNPAID", () => {
    expect(deriveDocumentPaymentState({ ...base, documentStatus: "draft" })).toBe("UNPAID");
  });

  it("pendingAsync → PENDING", () => {
    expect(deriveDocumentPaymentState({ ...base, pendingAsync: true })).toBe("PENDING");
  });

  it("全額返金 → REFUNDED", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 10000, refunded: 10000 })).toBe("REFUNDED");
  });

  it("一部返金 → PARTIALLY_REFUNDED", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 10000, refunded: 3000 })).toBe("PARTIALLY_REFUNDED");
  });

  it("過入金 → OVERPAID", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 15000 })).toBe("OVERPAID");
  });

  it("全額入金 → PAID", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 10000 })).toBe("PAID");
  });

  it("一部入金 → PARTIALLY_PAID", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 5000 })).toBe("PARTIALLY_PAID");
  });

  it("未入金(sent) → UNPAID", () => {
    expect(deriveDocumentPaymentState(base)).toBe("UNPAID");
  });

  it("overdue → UNPAID", () => {
    expect(deriveDocumentPaymentState({ ...base, documentStatus: "overdue" })).toBe("UNPAID");
  });

  it("合計 0 の帳票 → PAID", () => {
    expect(deriveDocumentPaymentState({ ...base, total: 0 })).toBe("PAID");
  });

  it("返金が入金を上回る → REFUNDED", () => {
    expect(deriveDocumentPaymentState({ ...base, paid: 5000, refunded: 6000 })).toBe("REFUNDED");
  });

  it("過入金+一部返金で netPaid > total → OVERPAID", () => {
    // paid=15000, refunded=3000 → netPaid=12000 > total=10000
    expect(deriveDocumentPaymentState({ ...base, paid: 15000, refunded: 3000 })).toBe("OVERPAID");
  });

  it("合計が負（クレジットノート等）→ PAID", () => {
    expect(deriveDocumentPaymentState({ ...base, total: -5000 })).toBe("PAID");
  });
});

describe("derivePoSPaymentState", () => {
  it("completed + no refund → PAID", () => {
    const ctx: PosPaymentContext = { status: "completed", amount: 5000, refundAmount: 0 };
    expect(derivePoSPaymentState(ctx)).toBe("PAID");
  });

  it("completed + partial refund → PARTIALLY_REFUNDED", () => {
    const ctx: PosPaymentContext = { status: "completed", amount: 5000, refundAmount: 1000 };
    expect(derivePoSPaymentState(ctx)).toBe("PARTIALLY_REFUNDED");
  });

  it("refunded → REFUNDED", () => {
    const ctx: PosPaymentContext = { status: "refunded", amount: 5000, refundAmount: 5000 };
    expect(derivePoSPaymentState(ctx)).toBe("REFUNDED");
  });

  it("partial_refund → PARTIALLY_REFUNDED", () => {
    const ctx: PosPaymentContext = { status: "partial_refund", amount: 5000, refundAmount: 2000 };
    expect(derivePoSPaymentState(ctx)).toBe("PARTIALLY_REFUNDED");
  });

  it("voided → CANCELED", () => {
    const ctx: PosPaymentContext = { status: "voided", amount: 5000, refundAmount: 0 };
    expect(derivePoSPaymentState(ctx)).toBe("CANCELED");
  });

  it("completed + full refund amount → REFUNDED", () => {
    const ctx: PosPaymentContext = { status: "completed", amount: 5000, refundAmount: 5000 };
    expect(derivePoSPaymentState(ctx)).toBe("REFUNDED");
  });
});

describe("deriveReservationPaymentState", () => {
  it("paid → PAID", () => expect(deriveReservationPaymentState("paid")).toBe("PAID"));
  it("partial → PARTIALLY_PAID", () => expect(deriveReservationPaymentState("partial")).toBe("PARTIALLY_PAID"));
  it("refunded → REFUNDED", () => expect(deriveReservationPaymentState("refunded")).toBe("REFUNDED"));
  it("unpaid → UNPAID", () => expect(deriveReservationPaymentState("unpaid")).toBe("UNPAID"));
  it("null → UNPAID", () => expect(deriveReservationPaymentState(null)).toBe("UNPAID"));
});
