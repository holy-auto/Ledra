import Stripe from "stripe";
import type { TemplateOptionType } from "@/types/templateOption";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion });
}

type OptionPriceConfig = {
  setupPriceId: string;
  monthlyPriceId: string;
};

function getOptionPrices(optionType: TemplateOptionType): OptionPriceConfig {
  if (optionType === "preset") {
    const setup = process.env.STRIPE_PRICE_TEMPLATE_PRESET_SETUP;
    const monthly = process.env.STRIPE_PRICE_TEMPLATE_PRESET_MONTHLY;
    if (!setup || !monthly) throw new Error("Missing STRIPE_PRICE_TEMPLATE_PRESET_* env vars");
    return { setupPriceId: setup, monthlyPriceId: monthly };
  }

  const setup = process.env.STRIPE_PRICE_TEMPLATE_CUSTOM_SETUP;
  const monthly = process.env.STRIPE_PRICE_TEMPLATE_CUSTOM_MONTHLY;
  if (!setup || !monthly) throw new Error("Missing STRIPE_PRICE_TEMPLATE_CUSTOM_* env vars");
  return { setupPriceId: setup, monthlyPriceId: monthly };
}

/**
 * テンプレートオプション用のStripe Checkout Sessionを作成
 * - 初期費用（one_time）+ 月額（recurring）を1つのセッションで処理
 */
export async function createTemplateOptionCheckout(params: {
  tenantId: string;
  customerId: string;
  optionType: TemplateOptionType;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  const prices = getOptionPrices(params.optionType);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    client_reference_id: params.tenantId,
    metadata: {
      tenant_id: params.tenantId,
      option_type: params.optionType,
      purpose: "template_option",
    },
    subscription_data: {
      metadata: {
        tenant_id: params.tenantId,
        option_type: params.optionType,
        purpose: "template_option",
      },
    },
    line_items: [
      // 初期費用（1回のみ）
      { price: prices.setupPriceId, quantity: 1 },
      // 月額（recurring）
      { price: prices.monthlyPriceId, quantity: 1 },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
  });

  return session;
}

/**
 * 追加作業用のStripe Invoiceを作成して送信
 */
export async function createAdditionalWorkInvoice(params: {
  customerId: string;
  tenantId: string;
  description: string;
  amount: number;
}) {
  const stripe = getStripe();

  const invoice = await stripe.invoices.create({
    customer: params.customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    metadata: {
      tenant_id: params.tenantId,
      purpose: "template_additional_work",
    },
  });

  await stripe.invoiceItems.create({
    customer: params.customerId,
    invoice: invoice.id,
    description: params.description,
    amount: params.amount,
    currency: "jpy",
  });

  await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  return invoice;
}

/** テンプレートオプション関連のWebhookかどうかを判定 */
export function isTemplateOptionEvent(metadata: Record<string, string> | null): boolean {
  return metadata?.purpose === "template_option";
}

export { getStripe };
