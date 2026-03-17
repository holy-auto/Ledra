import { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBaseUrl } from "@/lib/url";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiNotFound, apiValidationError, apiForbidden } from "@/lib/api/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paymentLinkSchema = z.object({
  invoice_id: z.string().uuid("請求書IDは必須です。"),
});

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" as any });
}

/**
 * POST: 請求書に対してStripe Connect経由の決済リンクを作成
 * - テナントのConnectアカウントを利用
 * - CARTRUST が決済を仲介し、テナントに売上を入金
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = paymentLinkSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map(i => i.message).join(" "));
    }

    const { invoice_id } = parsed.data;
    const admin = createAdminClient();

    // テナントのConnect状態を確認
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded, name")
      .eq("id", caller.tenantId)
      .single();

    if (!tenant) return apiNotFound("テナントが見つかりません。");

    if (!tenant.stripe_connect_account_id || !tenant.stripe_connect_onboarded) {
      return apiForbidden("Stripe Connect のオンボーディングを完了してください。");
    }

    // 請求書を取得
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, total, subject, recipient_name, status, customer_id")
      .eq("id", invoice_id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!invoice) return apiNotFound("請求書が見つかりません。");

    if (invoice.status === "paid") {
      return apiValidationError("この請求書は既に支払い済みです。");
    }

    const totalYen = Math.round((invoice.total as number) ?? 0);
    if (totalYen <= 0) {
      return apiValidationError("請求金額が0円以下のため決済リンクを作成できません。");
    }

    // Stripe Checkout Session をConnect経由で作成
    const stripe = getStripe();
    const baseUrl = resolveBaseUrl({ req });
    const platformFeeRate = 0.05; // 5% プラットフォーム手数料
    const applicationFee = Math.round(totalYen * platformFeeRate);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: {
              name: (invoice.subject as string) || `請求書 #${(invoice.id as string).slice(0, 8)}`,
              description: tenant.name ? `${tenant.name}からの請求` : undefined,
            },
            unit_amount: totalYen,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: tenant.stripe_connect_account_id as string,
        },
      },
      success_url: `${baseUrl}/payment/success?invoice=${invoice_id}`,
      cancel_url: `${baseUrl}/payment/cancel?invoice=${invoice_id}`,
      metadata: {
        tenant_id: caller.tenantId,
        invoice_id,
        source: "cartrust_connect",
      },
    });

    return apiOk({
      checkout_url: session.url,
      session_id: session.id,
      invoice_id,
      amount: totalYen,
      platform_fee: applicationFee,
    });
  } catch (e) {
    return apiInternalError(e, "stripe connect payment-link");
  }
}
