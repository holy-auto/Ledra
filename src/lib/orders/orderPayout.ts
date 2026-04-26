import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

type PayoutResult =
  | { ok: true; transferId: string }
  | { ok: false; reason: "no_payout_amount" | "manual_required" | "pending_onboarding" | "error"; detail?: string };

/**
 * job_order の施工店（to_tenant）へ payout_amount を Stripe Connect 送金する。
 * Connect 未設定の場合は ensureConnectAndNotify を呼びオンボーディングを促す。
 * 既に送金済みの場合は no-op で ok:true を返す。
 */
export async function executeOrderPayout(orderId: string): Promise<PayoutResult> {
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("job_orders")
    .select("id, invoice_number, payout_amount, to_tenant_id, payout_stripe_transfer_id")
    .eq("id", orderId)
    .single();

  if (!order?.payout_amount || !order?.to_tenant_id) {
    return { ok: false, reason: "no_payout_amount" };
  }

  // 既に送金済みの場合は no-op
  const existingId = order.payout_stripe_transfer_id as string | null;
  if (existingId && existingId !== "pending_onboarding" && existingId !== "manual_required") {
    return { ok: true, transferId: existingId };
  }

  const { data: shop } = await supabase
    .from("tenants")
    .select("stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", order.to_tenant_id as string)
    .single();

  // Connect 未設定 / 未完了 → オンボーディングを自動起動
  if (!shop?.stripe_connect_account_id || !shop?.stripe_connect_onboarded) {
    const { ensureConnectAndNotify } = await import("./connectAutoOnboard");
    await ensureConnectAndNotify(order.to_tenant_id as string, orderId);
    return { ok: false, reason: "pending_onboarding" };
  }

  try {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create({
      amount: Math.round(order.payout_amount as number),
      currency: "jpy",
      destination: shop.stripe_connect_account_id as string,
      metadata: {
        order_id: orderId,
        invoice_number: (order.invoice_number as string | null) ?? "",
      },
    });

    await supabase
      .from("job_orders")
      .update({
        payout_stripe_transfer_id: transfer.id,
        payout_executed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    logger.info("[orderPayout] payout executed", { orderId, transferId: transfer.id });
    return { ok: true, transferId: transfer.id };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error("[orderPayout] stripe transfer failed", { orderId, detail });
    return { ok: false, reason: "error", detail };
  }
}
