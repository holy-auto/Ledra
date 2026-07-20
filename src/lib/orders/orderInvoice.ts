import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { renderInvoicePdf, type TenantForPdf } from "@/lib/pdfInvoice";
import { sendResendEmail } from "@/lib/email/resendSend";
import { insertInvoiceWithRetry } from "@/lib/invoice/invoiceNumber";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";

function fmtJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** 受注側(to_tenant)の顧客から、発注元(from_tenant)を指す法人顧客を引き当てる。 */
async function resolveCounterpartyCustomer(
  supabase: SupabaseClient,
  toTenantId: string,
  fromTenantId: string,
): Promise<{
  id: string;
  name: string | null;
  billing_cycle: string | null;
  closing_day: number | null;
  payment_terms_days: number | null;
} | null> {
  const { data } = await supabase
    .from("customers")
    .select("id, name, billing_cycle, closing_day, payment_terms_days")
    .eq("tenant_id", toTenantId)
    .eq("linked_tenant_id", fromTenantId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * 合算払い（顧客の締め日にまとめて請求）に該当するかを判定する。
 * 該当する場合、per-order の請求書は作らず cron の合算生成に委ねる。
 */
export function isConsolidatedBilling(
  customer: { billing_cycle: string | null; closing_day: number | null } | null,
): boolean {
  return !!customer && customer.billing_cycle === "consolidated" && customer.closing_day != null;
}

function buildInvoiceEmailHtml(params: {
  invoiceNumber: string;
  orderTitle: string;
  requesterCompany: string | null;
  totalAmount: number;
  platformFeeAmount: number;
  payoutAmount: number;
  feeRatePct: number;
  dueDateStr: string;
}): string {
  const {
    invoiceNumber,
    orderTitle,
    requesterCompany,
    totalAmount,
    platformFeeAmount,
    payoutAmount,
    feeRatePct,
    dueDateStr,
  } = params;
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f9fc;font-family:'Helvetica Neue',Arial,sans-serif;color:#333">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#1a1f36;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700;letter-spacing:0.02em">Ledra BtoB</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px">
        ${requesterCompany ? `${requesterCompany} ご担当者様` : "ご担当者様"}
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7">
        このたびはLedra BtoBプラットフォームをご利用いただきありがとうございます。<br>
        下記の請求書を発行いたしましたのでご確認ください。
      </p>

      <div style="background:#f8fafc;border-radius:6px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr>
            <td style="color:#888;padding:5px 0;width:130px">請求書番号</td>
            <td style="font-weight:600">${invoiceNumber}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">件名</td>
            <td>${orderTitle}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">請求金額</td>
            <td style="font-size:17px;font-weight:700;color:#1a1f36">${fmtJpy(totalAmount)}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">支払期限</td>
            <td style="font-weight:600;color:#e53e3e">${dueDateStr}</td>
          </tr>
        </table>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px;margin-bottom:24px;font-size:12px;color:#92400e;line-height:1.7">
        <strong>【手数料の内訳】</strong><br>
        プラットフォーム手数料（${feeRatePct}%）：${fmtJpy(platformFeeAmount)}<br>
        施工店受取金額（${100 - feeRatePct}%）：${fmtJpy(payoutAmount)}<br>
        ※ お振込み確認後、施工店への送金を自動処理いたします。
      </div>

      <p style="font-size:13px;color:#555;margin:0 0 8px">請求書PDFを添付しています。ご確認のうえ、支払期限までにお振込みください。</p>
      <p style="font-size:12px;color:#aaa;margin:0">ご不明な点はお問い合わせページよりご連絡ください。</p>
    </div>
    <div style="background:#f6f9fc;padding:16px 32px;font-size:11px;color:#aaa;text-align:center">
      © Ledra — BtoBプラットフォーム
    </div>
  </div>
</body>
</html>`;
}

/**
 * BtoB 受発注の請求書を **documents 帳票として保存（ensure）**し、公開案件(platform)は
 * さらに請求書PDFを requester にメール送付する。approval_pending → payment_pending 遷移で
 * fire-and-forget 呼び出しされる（呼び出し元: orders PUT / inspection-sign）。
 *
 * 分岐:
 *  - billing_method='platform'（公開案件）: 従来どおり per-order 請求書(status='sent')＋手数料内訳＋
 *    自動メール＋Stripe送金前提。
 *  - billing_method='invoice'（指名）: 手数料0・請求書払い。
 *      · 相手が合算払い顧客（billing_cycle=consolidated かつ 締め日あり）→ per-order は作らず
 *        cron の合算生成に委ねる（何もしない）。
 *      · それ以外（都度払い/顧客未紐付け）→ per-order 請求書を **status='draft'** で保存し、
 *        送付はしない（確認後送付）。
 *
 * documents 行は job_order_id 単位で冪等（存在すれば再作成しない）。二入口からの二重呼び出し・
 * 遷移リトライに対して、存在チェック＋部分ユニーク索引が最終防壁。
 */
export async function sendOrderInvoiceEmail(orderId: string): Promise<void> {
  const supabase = createServiceRoleAdmin(
    "orders/orderInvoice: 個別 job_order の請求書発行/保存 (from_tenant/to_tenant 跨ぎ)",
  );

  const { data: order, error } = await supabase
    .from("job_orders")
    .select(
      `id, public_id, order_number, title, category, description,
       from_tenant_id, to_tenant_id, billing_method, billing_timing,
       accepted_amount, platform_fee_rate,
       requester_email, requester_company,
       from_tenant:tenants!from_tenant_id ( name ),
       to_tenant:tenants!to_tenant_id (
         name, address, contact_email, contact_phone,
         registration_number, logo_asset_path, company_seal_path, bank_info
       )`,
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    logger.warn("[orderInvoice] order not found", { orderId, error: error?.message });
    return;
  }

  const toTenantId = order.to_tenant_id as string | null;
  const fromTenantId = order.from_tenant_id as string;
  const acceptedAmount = order.accepted_amount as number | null;

  // 発行元（施工店）と金額が無ければ請求書は作れない。
  if (!toTenantId) {
    logger.warn("[orderInvoice] to_tenant not set", { orderId });
    return;
  }
  if (!acceptedAmount) {
    logger.info("[orderInvoice] skipped — no accepted_amount", { orderId });
    return;
  }
  // 月次合算 (tenant_billing_settings.monthly) は runMonthlyInvoices が持つのでここでは作らない。
  if (order.billing_timing === "monthly") {
    logger.info("[orderInvoice] skipped — billing_timing=monthly (handled by runMonthlyInvoices)", { orderId });
    return;
  }

  const tenant = order.to_tenant as unknown as TenantForPdf | null;
  if (!tenant) {
    logger.warn("[orderInvoice] to_tenant row not found", { orderId });
    return;
  }

  const billingMethod = (order.billing_method as string | null) ?? "platform";
  const isInvoiceBilling = billingMethod === "invoice";

  // 指名(invoice)は相手を法人顧客として引き当て、合算払いなら per-order は作らない。
  let counterpartyCustomer = null as Awaited<ReturnType<typeof resolveCounterpartyCustomer>>;
  if (isInvoiceBilling) {
    counterpartyCustomer = await resolveCounterpartyCustomer(supabase, toTenantId, fromTenantId);
    if (isConsolidatedBilling(counterpartyCustomer)) {
      logger.info("[orderInvoice] deferred to cycle-consolidated invoice", { orderId });
      return;
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const issuedYmd = todayJst(now);

  // 手数料（指名=0）。platform_fee_rate は指名で 0、公開で 0.1。
  const feeRate = isInvoiceBilling ? 0 : ((order.platform_fee_rate as number) ?? 0.1);
  const feeRatePct = Math.round(feeRate * 100);
  const platformFeeAmount = Math.round(acceptedAmount * feeRate);
  const payoutAmount = acceptedAmount - platformFeeAmount;

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueYmd = dueDate.toISOString().slice(0, 10);
  const dueDateStr = dueDate.toLocaleDateString("ja-JP");

  // note: 指名はプレーンなBtoB請求書、公開は手数料内訳を出す。
  const noteLines = isInvoiceBilling
    ? [`Ledra 加盟店間の直接請求です（プラットフォーム手数料なし）。`, `お支払期限までにお振込みください。`]
    : [
        `【プラットフォーム手数料】`,
        `手数料（${feeRatePct}%）：${fmtJpy(platformFeeAmount)}`,
        `施工店受取金額（${100 - feeRatePct}%）：${fmtJpy(payoutAmount)}`,
        ``,
        `お振込み確認後、施工店への送金を自動処理いたします。`,
      ];

  const recipientName =
    counterpartyCustomer?.name ??
    (order.requester_company as string | null) ??
    (order.requester_email as string | null) ??
    (order.from_tenant as { name?: string } | null)?.name ??
    null;

  // ─── documents 帳票を冪等に ensure ───
  const { data: existingRows } = await supabase
    .from("documents")
    .select("id, doc_number")
    .eq("tenant_id", toTenantId)
    .eq("job_order_id", orderId)
    .eq("doc_type", "invoice")
    .order("created_at", { ascending: true })
    .limit(1);

  let docId = existingRows?.[0]?.id ?? null;
  let invoiceNumber = (existingRows?.[0]?.doc_number as string | null) ?? null;

  if (!docId) {
    const status = isInvoiceBilling ? "draft" : "sent"; // 指名は確認後送付のため下書き
    const { data: inserted, error: insErr } = await insertInvoiceWithRetry(
      supabase,
      toTenantId,
      (docNumber: string) =>
        supabase
          .from("documents")
          .insert({
            tenant_id: toTenantId,
            counterparty_tenant_id: fromTenantId,
            customer_id: counterpartyCustomer?.id ?? null,
            job_order_id: orderId,
            doc_type: "invoice",
            doc_number: docNumber,
            issued_at: issuedYmd,
            due_date: dueYmd,
            status,
            subtotal: acceptedAmount,
            tax: 0,
            total: acceptedAmount,
            tax_rate: 0,
            items_json: [
              {
                description: `${order.title as string}${order.category ? ` (${order.category as string})` : ""}`,
                quantity: 1,
                unit_price: acceptedAmount,
                amount: acceptedAmount,
              },
            ],
            note: noteLines.join("\n"),
            meta_json: { source: "job_order", billing_method: billingMethod },
            is_invoice_compliant: false,
            show_seal: false,
            show_logo: true,
            show_bank_info: !!tenant.bank_info,
            recipient_name: recipientName,
          })
          .select("id, doc_number")
          .single(),
      { now },
    );
    if (insErr || !inserted) {
      logger.error("[orderInvoice] documents insert failed", { orderId, error: insErr?.message });
      return;
    }
    docId = inserted.id as string;
    invoiceNumber = inserted.doc_number as string;
  }

  if (!docId || !invoiceNumber) {
    logger.error("[orderInvoice] missing document after ensure", { orderId });
    return;
  }

  // job_orders への控え書き戻し（メール可否に関わらず）。
  await supabase
    .from("job_orders")
    .update({
      invoice_number: invoiceNumber,
      invoice_due_date: dueYmd,
      platform_fee_amount: platformFeeAmount,
      payout_amount: payoutAmount,
    })
    .eq("id", orderId);

  // ─── メール送付は公開案件(platform)のみ・requester_email がある時だけ ───
  // 指名(invoice)は確認後送付（発行元が /admin/documents/share から送る）ため自動送信しない。
  if (isInvoiceBilling || !order.requester_email) {
    if (isInvoiceBilling) {
      logger.info("[orderInvoice] persisted as draft (指名, 確認後送付)", { orderId, invoiceNumber });
    } else {
      logger.info("[orderInvoice] persisted, email skipped — no requester_email", { orderId, invoiceNumber });
    }
    return;
  }

  const invoiceData = {
    id: docId,
    invoice_number: invoiceNumber,
    status: "sent",
    issued_at: nowIso,
    due_date: dueYmd,
    subtotal: acceptedAmount,
    tax: 0,
    total: acceptedAmount,
    tax_rate: 0,
    items_json: [
      {
        description: `${order.title as string}${order.category ? ` (${order.category as string})` : ""}`,
        quantity: 1,
        unit_price: acceptedAmount,
        amount: acceptedAmount,
      },
    ],
    note: noteLines.join("\n"),
    recipient_name: recipientName ?? (order.requester_email as string),
    show_seal: false,
    show_logo: true,
    show_bank_info: !!tenant.bank_info,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderInvoicePdf(invoiceData, tenant, (order.requester_company as string | null) ?? null);
  } catch (e) {
    logger.error("[orderInvoice] pdf generation failed", { orderId, error: String(e) });
    return;
  }

  const emailResult = await sendResendEmail({
    to: order.requester_email as string,
    subject: `【請求書】${invoiceNumber} — ${order.title as string}`,
    html: buildInvoiceEmailHtml({
      invoiceNumber: invoiceNumber as string,
      orderTitle: order.title as string,
      requesterCompany: (order.requester_company as string | null) ?? null,
      totalAmount: acceptedAmount,
      platformFeeAmount,
      payoutAmount,
      feeRatePct,
      dueDateStr,
    }),
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer.toString("base64"),
      },
    ],
    idempotencyKey: `order-invoice-${order.id}`,
  });

  if (!emailResult.ok) {
    logger.error("[orderInvoice] email send failed", { orderId, error: emailResult.error });
    return;
  }

  await supabase.from("job_orders").update({ invoice_sent_at: nowIso }).eq("id", orderId);

  logger.info("[orderInvoice] sent", { orderId, invoiceNumber, to: order.requester_email });
}
