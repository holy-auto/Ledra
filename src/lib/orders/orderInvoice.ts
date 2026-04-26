import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoicePdf, type TenantForPdf } from "@/lib/pdfInvoice";
import { sendResendEmail } from "@/lib/email/resendSend";
import { logger } from "@/lib/logger";

function fmtJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
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
  const { invoiceNumber, orderTitle, requesterCompany, totalAmount, platformFeeAmount, payoutAmount, feeRatePct, dueDateStr } = params;
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
 * Generates an invoice PDF for a BtoB job order and emails it to the requester.
 * Called fire-and-forget when the order transitions to payment_pending.
 */
export async function sendOrderInvoiceEmail(orderId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from("job_orders")
    .select(
      `id, public_id, order_number, title, category, description,
       accepted_amount, platform_fee_rate,
       requester_email, requester_company,
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

  if (!order.requester_email || !order.accepted_amount) {
    logger.info("[orderInvoice] skipped — no requester_email or accepted_amount", { orderId });
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = (order.order_number ?? order.public_id.replace("jo_", "")).slice(0, 8).toUpperCase();
  const invoiceNumber = `INV-${dateStr}-${shortId}`;

  const feeRate = (order.platform_fee_rate as number) ?? 0.1;
  const feeRatePct = Math.round(feeRate * 100);
  const platformFeeAmount = Math.round((order.accepted_amount as number) * feeRate);
  const payoutAmount = (order.accepted_amount as number) - platformFeeAmount;

  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toLocaleDateString("ja-JP");

  const tenant = (order.to_tenant as unknown) as TenantForPdf | null;
  if (!tenant) {
    logger.warn("[orderInvoice] to_tenant not found", { orderId });
    return;
  }

  const noteLines = [
    `【プラットフォーム手数料】`,
    `手数料（${feeRatePct}%）：${fmtJpy(platformFeeAmount)}`,
    `施工店受取金額（${100 - feeRatePct}%）：${fmtJpy(payoutAmount)}`,
    ``,
    `お振込み確認後、施工店への送金を自動処理いたします。`,
  ];

  const invoiceData = {
    id: order.id as string,
    invoice_number: invoiceNumber,
    status: "sent",
    issued_at: now.toISOString(),
    due_date: dueDate.toISOString().slice(0, 10),
    subtotal: order.accepted_amount as number,
    tax: 0,
    total: order.accepted_amount as number,
    tax_rate: 0,
    items_json: [
      {
        description: `${order.title as string}${order.category ? ` (${order.category as string})` : ""}`,
        quantity: 1,
        unit_price: order.accepted_amount as number,
        amount: order.accepted_amount as number,
      },
    ],
    note: noteLines.join("\n"),
    recipient_name: (order.requester_company as string | null) ?? (order.requester_email as string),
    show_seal: false,
    show_logo: true,
    show_bank_info: !!tenant.bank_info,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderInvoicePdf(
      invoiceData,
      tenant,
      (order.requester_company as string | null) ?? null,
    );
  } catch (e) {
    logger.error("[orderInvoice] pdf generation failed", { orderId, error: String(e) });
    return;
  }

  const emailResult = await sendResendEmail({
    to: order.requester_email as string,
    subject: `【請求書】${invoiceNumber} — ${order.title as string}`,
    html: buildInvoiceEmailHtml({
      invoiceNumber,
      orderTitle: order.title as string,
      requesterCompany: (order.requester_company as string | null) ?? null,
      totalAmount: order.accepted_amount as number,
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

  await supabase
    .from("job_orders")
    .update({
      invoice_number: invoiceNumber,
      invoice_sent_at: now.toISOString(),
      invoice_due_date: dueDate.toISOString().slice(0, 10),
      platform_fee_amount: platformFeeAmount,
      payout_amount: payoutAmount,
    })
    .eq("id", orderId);

  logger.info("[orderInvoice] sent", { orderId, invoiceNumber, to: order.requester_email });
}
