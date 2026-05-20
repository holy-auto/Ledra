/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createInvoicePaymentLink } from "@/lib/stripe/invoicePaymentLink";

function makeStripeMock(returnUrl: string | null = "https://stripe.checkout/x"): any {
  const sessions = {
    create: vi.fn(async () => ({ id: "sess_123", url: returnUrl })),
  };
  return { checkout: { sessions } };
}

describe("createInvoicePaymentLink", () => {
  const baseOpts = {
    tenantId: "tenant-1",
    tenantName: "サンプル整備工場",
    stripeConnectAccountId: "acct_abc",
    invoiceId: "11111111-1111-1111-1111-111111111111",
    invoiceDocNumber: "INV-2026-001",
    totalYen: 10000,
    baseUrl: "https://app.ledra.co.jp",
  };

  it("creates a Stripe Checkout Session with correct config", async () => {
    const stripe = makeStripeMock();
    const result = await createInvoicePaymentLink({ ...baseOpts, stripe });

    expect(result.checkoutUrl).toBe("https://stripe.checkout/x");
    expect(result.sessionId).toBe("sess_123");
    expect(result.totalYen).toBe(10000);
    expect(result.applicationFee).toBe(100); // 1%

    const callArgs = (stripe.checkout.sessions.create as any).mock.calls[0][0];
    expect(callArgs.mode).toBe("payment");
    expect(callArgs.line_items[0].price_data.currency).toBe("jpy");
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(10000);
    expect(callArgs.line_items[0].price_data.product_data.name).toBe("INV-2026-001");
    expect(callArgs.payment_intent_data.application_fee_amount).toBe(100);
    expect(callArgs.payment_intent_data.transfer_data.destination).toBe("acct_abc");
    expect(callArgs.success_url).toBe(
      "https://app.ledra.co.jp/payment/success?invoice=11111111-1111-1111-1111-111111111111",
    );
    expect(callArgs.cancel_url).toBe(
      "https://app.ledra.co.jp/payment/cancel?invoice=11111111-1111-1111-1111-111111111111",
    );
    expect(callArgs.metadata).toEqual({
      tenant_id: "tenant-1",
      invoice_id: "11111111-1111-1111-1111-111111111111",
      source: "ledra_connect",
    });
  });

  it("falls back to invoice id prefix when doc_number is missing", async () => {
    const stripe = makeStripeMock();
    await createInvoicePaymentLink({ ...baseOpts, invoiceDocNumber: null, stripe });
    const callArgs = (stripe.checkout.sessions.create as any).mock.calls[0][0];
    expect(callArgs.line_items[0].price_data.product_data.name).toBe("請求書 #11111111");
  });

  it("rounds total + computes 1% application fee", async () => {
    const stripe = makeStripeMock();
    const result = await createInvoicePaymentLink({ ...baseOpts, totalYen: 12345.67, stripe });
    expect(result.totalYen).toBe(12346);
    // floor(12346 * 0.01) → 123 で .5 以下なので round = 123
    expect(result.applicationFee).toBe(Math.round(12346 * 0.01));
  });

  it("throws when total is zero or negative", async () => {
    const stripe = makeStripeMock();
    await expect(createInvoicePaymentLink({ ...baseOpts, totalYen: 0, stripe })).rejects.toThrow(
      "invalid_total_amount",
    );
    await expect(createInvoicePaymentLink({ ...baseOpts, totalYen: -100, stripe })).rejects.toThrow(
      "invalid_total_amount",
    );
  });

  it("throws when Stripe returns no URL", async () => {
    const stripe = makeStripeMock(null);
    await expect(createInvoicePaymentLink({ ...baseOpts, stripe })).rejects.toThrow("stripe_session_missing_url");
  });

  it("omits issuer description when tenantName is null", async () => {
    const stripe = makeStripeMock();
    await createInvoicePaymentLink({ ...baseOpts, tenantName: null, stripe });
    const callArgs = (stripe.checkout.sessions.create as any).mock.calls[0][0];
    expect(callArgs.line_items[0].price_data.product_data.description).toBeUndefined();
  });
});
