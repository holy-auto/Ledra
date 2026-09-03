import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveBaseUrl } from "@/lib/url";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiForbidden,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInvoicePaymentLink } from "@/lib/stripe/invoicePaymentLink";
import { z } from "zod";

export const dynamic = "force-dynamic";

const paymentLinkSchema = z.object({
  invoice_id: z.string().uuid("請求書IDは必須です。"),
});

function getStripe() {
  return getStripeClient();
}

/**
 * POST: 請求書に対してStripe Connect経由の決済リンクを作成
 * - テナントのConnectアカウントを利用
 * - Ledra が決済を仲介し、テナントに売上を入金
 */
export async function POST(req: NextRequest) {
  // Each call hits Stripe to create a Checkout Session and is invoked from
  // the admin invoices view. Auth preset (10/min/IP) protects against an
  // attacker spamming Stripe API on a leaked admin session.
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 顧客への決済リンク発行は payments:create（staff 以上、2026-09-03 代表判断）。
    // 現場が作業後に請求を出すのは通常業務なので staff に開く。
    if (!requirePermission(caller, "payments:create")) return apiForbidden();

    const body = await req.json().catch(() => ({}));
    const parsed = paymentLinkSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues.map((i) => i.message).join(" "));
    }

    const { invoice_id } = parsed.data;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

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

    // 請求書を取得 (documents テーブルから)
    const { data: invoice } = await admin
      .from("documents")
      .select("id, total, doc_number, recipient_name, status, customer_id")
      .eq("id", invoice_id)
      .eq("tenant_id", caller.tenantId)
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .single();

    if (!invoice) return apiNotFound("請求書が見つかりません。");

    if (invoice.status === "paid") {
      return apiValidationError("この請求書は既に支払い済みです。");
    }

    const totalYen = Math.round((invoice.total as number) ?? 0);
    if (totalYen <= 0) {
      return apiValidationError("請求金額が0円以下のため決済リンクを作成できません。");
    }

    try {
      const result = await createInvoicePaymentLink({
        stripe: getStripe(),
        tenantId: caller.tenantId,
        tenantName: (tenant.name as string | null) ?? null,
        stripeConnectAccountId: tenant.stripe_connect_account_id as string,
        invoiceId: invoice.id as string,
        invoiceDocNumber: (invoice.doc_number as string | null) ?? null,
        totalYen,
        baseUrl: resolveBaseUrl({ req }),
      });

      return apiOk({
        checkout_url: result.checkoutUrl,
        session_id: result.sessionId,
        invoice_id,
        amount: result.totalYen,
        platform_fee: result.applicationFee,
      });
    } catch (e) {
      return apiInternalError(e, "stripe connect payment-link: session");
    }
  } catch (e) {
    return apiInternalError(e, "stripe connect payment-link");
  }
}
