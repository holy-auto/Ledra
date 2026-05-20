import Stripe from "stripe";

/**
 * Stripe Connect 経由の Checkout Session を作成して請求書決済 URL を返す共通ヘルパ。
 *
 * 同等ロジックを /api/stripe/connect/payment-link と
 * /api/admin/invoices/[id]/send-line-payment-link が共有するために抽出した。
 * 既存エンドポイントの挙動は変えないこと (platform fee 1%, JPY 通貨, success_url
 * は /payment/success?invoice=ID, transfer_data は tenant の Connect ID)。
 */

export interface CreateInvoicePaymentLinkOpts {
  /** STRIPE_SECRET_KEY で初期化された Stripe SDK インスタンス。テスト時は注入。 */
  stripe: Stripe;
  tenantId: string;
  tenantName: string | null;
  /** tenants.stripe_connect_account_id (acct_...) */
  stripeConnectAccountId: string;
  invoiceId: string;
  invoiceDocNumber: string | null;
  totalYen: number;
  baseUrl: string;
}

export interface InvoicePaymentLinkResult {
  checkoutUrl: string;
  sessionId: string;
  applicationFee: number;
  totalYen: number;
}

const PLATFORM_FEE_RATE = 0.01; // 1%

export async function createInvoicePaymentLink(opts: CreateInvoicePaymentLinkOpts): Promise<InvoicePaymentLinkResult> {
  const totalYen = Math.round(opts.totalYen);
  if (!Number.isFinite(totalYen) || totalYen <= 0) {
    throw new Error("invalid_total_amount");
  }

  const applicationFee = Math.round(totalYen * PLATFORM_FEE_RATE);
  const productName = opts.invoiceDocNumber || `請求書 #${opts.invoiceId.slice(0, 8)}`;

  const session = await opts.stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: productName,
            description: opts.tenantName ? `${opts.tenantName}からの請求` : undefined,
          },
          unit_amount: totalYen,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFee,
      transfer_data: {
        destination: opts.stripeConnectAccountId,
      },
    },
    success_url: `${opts.baseUrl}/payment/success?invoice=${opts.invoiceId}`,
    cancel_url: `${opts.baseUrl}/payment/cancel?invoice=${opts.invoiceId}`,
    metadata: {
      tenant_id: opts.tenantId,
      invoice_id: opts.invoiceId,
      source: "ledra_connect",
    },
  });

  if (!session.url) {
    throw new Error("stripe_session_missing_url");
  }

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    applicationFee,
    totalYen,
  };
}
