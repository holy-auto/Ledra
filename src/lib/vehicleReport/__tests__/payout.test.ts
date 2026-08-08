import { describe, it, expect } from "vitest";
import { reversalActionForStatus, postCancelClaimAction } from "../payout";

describe("reversalActionForStatus", () => {
  it("reverses the Stripe transfer when money was already sent", () => {
    expect(reversalActionForStatus("paid", true)).toBe("reverse_transfer");
  });

  it("cancels a paid row that never got a transfer id (nothing was sent)", () => {
    expect(reversalActionForStatus("paid", false)).toBe("cancel");
  });

  it("cancels shares that have no transfer dispatched yet", () => {
    expect(reversalActionForStatus("pending", false)).toBe("cancel");
    expect(reversalActionForStatus("approved", false)).toBe("cancel");
  });

  it("reverses an in-flight transfer even before it is webhook-confirmed paid", () => {
    // approved + transfer id = money already dispatched to Stripe. Cancelling
    // the ledger row would strand it, so it must be reversed, not cancelled.
    expect(reversalActionForStatus("approved", true)).toBe("reverse_transfer");
  });

  it("skips rows already in a terminal reversal/cancel state", () => {
    expect(reversalActionForStatus("reversed", true)).toBe("skip");
    expect(reversalActionForStatus("cancelled", false)).toBe("skip");
    expect(reversalActionForStatus("failed", false)).toBe("skip");
  });
});

describe("postCancelClaimAction (cancel-vs-concurrent-payout race)", () => {
  it("confirms cancellation when the atomic claim took the row", () => {
    // Guard matched → the row was cancelled as intended; fresh read irrelevant.
    expect(postCancelClaimAction(1, "approved", null)).toBe("cancelled");
  });

  it("reverses when a concurrent payout dispatched a transfer under us", () => {
    // Claim affected 0 rows because a payout flipped it to paid + transfer id
    // between our load and the cancel UPDATE. Money moved → must reverse.
    expect(postCancelClaimAction(0, "paid", "tr_123")).toBe("reverse_transfer");
  });

  it("skips when the row is already terminal (someone else finished it)", () => {
    expect(postCancelClaimAction(0, "reversed", "tr_123")).toBe("skip");
    expect(postCancelClaimAction(0, "cancelled", null)).toBe("skip");
  });

  it("skips when no transfer exists to reverse (row vanished or still un-paid)", () => {
    expect(postCancelClaimAction(0, null, null)).toBe("skip");
    expect(postCancelClaimAction(0, "approved", null)).toBe("skip");
  });
});
