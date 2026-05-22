import { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { resolveBaseUrl } from "@/lib/url";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { sendCustomerLineText } from "@/lib/line/client";
import { createInvoicePaymentLink } from "@/lib/stripe/invoicePaymentLink";

export const dynamic = "force-dynamic";

function getStripe() {
  return getStripeClient();
}

/**
 * POST /api/admin/invoices/[id]/send-line-payment-link
 *
 * Tekmerchant 風の "Text-to-Pay"。請求書から Stripe Connect Checkout を生成し、
 * 顧客に LINE で送信する。前提:
 *   - 顧客に customers.line_user_id が紐付いている
 *   - テナントが Stripe Connect オンボーディング済
 *   - 請求書が draft / sent (paid / cancelled は不可)
 *
 * メッセージは customer_messages に outbound として記録される
 * (sendCustomerLineText 経由)。LINE 配信に失敗しても URL 自体は返すため、
 * クライアント側でコピー可能なフォールバック表示ができる。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Stripe Checkout 生成は重い + 課金関連なのでレート制限。
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { id: invoiceId } = await ctx.params;
    if (!invoiceId) return apiValidationError("invoice id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // テナント (Connect 状態)
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, name, stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .maybeSingle();
    if (tenantErr) return apiInternalError(tenantErr, "send-line-payment-link: tenant fetch");
    if (!tenant) return apiNotFound("tenant_not_found");
    if (!tenant.stripe_connect_account_id || !tenant.stripe_connect_onboarded) {
      return apiForbidden("Stripe Connect のオンボーディングを完了してください。");
    }

    // 請求書
    const { data: invoice, error: invErr } = await admin
      .from("documents")
      .select("id, doc_number, doc_type, status, total, customer_id, recipient_name")
      .eq("id", invoiceId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (invErr) return apiInternalError(invErr, "send-line-payment-link: invoice fetch");
    if (!invoice || !["invoice", "consolidated_invoice"].includes(invoice.doc_type as string)) {
      return apiNotFound("invoice_not_found");
    }
    if (invoice.status === "paid") return apiValidationError("この請求書は既に支払い済みです。");
    if (invoice.status === "cancelled")
      return apiValidationError("キャンセル済の請求書には決済リンクを送信できません。");

    const totalYen = Math.round((invoice.total as number) ?? 0);
    if (totalYen <= 0) return apiValidationError("請求金額が 0 円以下のため決済リンクを作成できません。");
    if (!invoice.customer_id) {
      return apiValidationError("顧客が紐付いていない請求書には LINE 送信できません。");
    }

    // 顧客 (LINE 紐付け)
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", invoice.customer_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (custErr) return apiInternalError(custErr, "send-line-payment-link: customer fetch");
    if (!customer) return apiNotFound("customer_not_found");
    if (!customer.line_user_id) {
      return apiValidationError("この顧客には LINE ユーザがまだ紐付いていません。");
    }

    // Stripe Connect Checkout を作成
    let linkResult;
    try {
      linkResult = await createInvoicePaymentLink({
        stripe: getStripe(),
        tenantId: caller.tenantId,
        tenantName: (tenant.name as string | null) ?? null,
        stripeConnectAccountId: tenant.stripe_connect_account_id as string,
        invoiceId: invoice.id as string,
        invoiceDocNumber: (invoice.doc_number as string | null) ?? null,
        totalYen,
        baseUrl: resolveBaseUrl({ req }),
      });
    } catch (e) {
      return apiInternalError(e, "send-line-payment-link: stripe session");
    }

    // LINE で送信
    const recipientName = (invoice.recipient_name as string | null) ?? (customer.name as string | null) ?? "お客様";
    const lineBody = [
      `${recipientName} 様`,
      ``,
      `お支払いのご案内です。`,
      `請求書: ${invoice.doc_number ?? `#${(invoice.id as string).slice(0, 8)}`}`,
      `金額: ¥${totalYen.toLocaleString("ja-JP")}`,
      ``,
      `以下のリンクからクレジットカードでお支払いいただけます:`,
      linkResult.checkoutUrl,
      ``,
      `※リンクは 24 時間有効です。`,
    ].join("\n");

    const delivered = await sendCustomerLineText({
      tenantId: caller.tenantId,
      customerId: customer.id as string,
      lineUserId: customer.line_user_id as string,
      body: lineBody,
      sentByUserId: caller.userId,
    });

    // status="draft" の請求書は送信時に sent に進めるか議論あるが、副作用を増やさず本機能は
    // リンク送信に専念する。明示的にステータスを進めたい場合は UI 側の handleStatusChange で対応。

    return apiJson({
      ok: true,
      delivered,
      checkout_url: linkResult.checkoutUrl,
      session_id: linkResult.sessionId,
      amount: linkResult.totalYen,
    });
  } catch (e) {
    return apiInternalError(e, "send-line-payment-link");
  }
}
