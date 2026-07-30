import { describe, it, expect } from "vitest";
import { reversalActionForStatus } from "../payout";

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
