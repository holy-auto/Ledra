import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoicePdf, type TenantForPdf } from "@/lib/pdfInvoice";
import { sendResendEmail } from "@/lib/email/resendSend";
import { logger } from "@/lib/logger";

function fmtJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function buildConsolidatedEmailHtml(params: {
  invoiceNumber: string;
  requesterCompany: string | null;
  totalAmount: number;
  orderCount: number;
  dueDateStr: string;
  billingMonthStr: string;
}): string {
  const { invoiceNumber, requesterCompany, totalAmount, orderCount, dueDateStr, billingMonthStr } = params;
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
        ${billingMonthStr}分の合算請求書を発行いたしました。<br>
        今月完了した案件 <strong>${orderCount}件</strong> をまとめて請求させていただきます。
      </p>
      <div style="background:#f8fafc;border-radius:6px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr>
            <td style="color:#888;padding:5px 0;width:130px">請求書番号</td>
            <td style="font-weight:600">${invoiceNumber}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">対象期間</td>
            <td>${billingMonthStr}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">案件数</td>
            <td>${orderCount}件</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">請求金額（合計）</td>
            <td style="font-size:17px;font-weight:700;color:#1a1f36">${fmtJpy(totalAmount)}</td>
          </tr>
          <tr>
            <td style="color:#888;padding:5px 0">支払期限</td>
            <td style="font-weight:600;color:#e53e3e">${dueDateStr}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#555;margin:0 0 8px">
        合算請求書PDFを添付しています。支払期限（翌月末）までにお振込みください。<br>
        入金確認後、各施工店へ自動的に送金いたします。
      </p>
    </div>
    <div style="background:#f6f9fc;padding:16px 32px;font-size:11px;color:#aaa;text-align:center">
      © Ledra — BtoBプラットフォーム
    </div>
  </div>
</body>
</html>`;
}

/**
 * 末締め請求：指定月の payment_pending かつ未請求の monthly 案件を
 * 発注元テナントごとにまとめて合算請求書 PDF を生成・送付する。
 *
 * @param targetDate 対象月の任意の日付（デフォルト：今日）
 */
export async function runMonthlyInvoices(targetDate?: Date): Promise<{ sent: number; errors: number }> {
  const supabase = createAdminClient();
  const now = targetDate ?? new Date();

  // 対象月（例: "2026年4月"）
  const billingMonthStr = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });

  // 当月1日〜末日の範囲
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // 支払期限 = 翌月末
  const dueDate = lastDayOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const dueDateStr = dueDate.toLocaleDateString("ja-JP");

  // 対象案件を取得（当月中に payment_pending になった monthly 案件）
  const { data: orders, error } = await supabase
    .from("job_orders")
    .select(
      `id, title, category, accepted_amount, platform_fee_rate,
       from_tenant_id, to_tenant_id, requester_email, requester_company,
       order_number, public_id,
       to_tenant:tenants!to_tenant_id (
         name, address, contact_email, contact_phone,
         registration_number, logo_asset_path, company_seal_path, bank_info
       )`,
    )
    .eq("billing_timing", "monthly")
    .eq("status", "payment_pending")
    .is("invoice_sent_at", null)
    .gte("client_approved_at", monthStart)
    .lte("client_approved_at", monthEnd);

  if (error) {
    logger.error("[monthlyInvoice] fetch failed", { error: error.message });
    return { sent: 0, errors: 1 };
  }

  if (!orders || orders.length === 0) {
    logger.info("[monthlyInvoice] no pending monthly orders", { month: billingMonthStr });
    return { sent: 0, errors: 0 };
  }

  // 発注元テナントごとにグルーピング
  const grouped = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.from_tenant_id as string;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(order);
  }

  let sent = 0;
  let errors = 0;

  for (const [fromTenantId, tenantOrders] of grouped) {
    try {
      // 送付先メールは requester_email（全行同じはずだが最初の値を使用）
      const firstOrder = tenantOrders[0];
      const recipientEmail = firstOrder.requester_email as string | null;
      if (!recipientEmail) {
        logger.info("[monthlyInvoice] skipped — no requester_email", { fromTenantId });
        continue;
      }

      const recipientCompany = firstOrder.requester_company as string | null;

      // 集計
      const totalAmount = tenantOrders.reduce((sum, o) => sum + ((o.accepted_amount as number) ?? 0), 0);
      if (totalAmount === 0) continue;

      // 請求書番号（例: CINV-202604-ABC1）
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const shortId = fromTenantId.slice(0, 4).toUpperCase();
      const invoiceNumber = `CINV-${dateStr}-${shortId}`;

      // 施工店情報（最初の受注テナントを代表として使用）
      const tenant = (firstOrder.to_tenant as unknown) as TenantForPdf | null;
      if (!tenant) continue;

      // PDF 生成
      const feeRate = (firstOrder.platform_fee_rate as number) ?? 0.1;
      const feeRatePct = Math.round(feeRate * 100);

      const items = tenantOrders.map((o) => {
        const amount = (o.accepted_amount as number) ?? 0;
        const fee = Math.round(amount * feeRate);
        return {
          description: `${o.title as string}${o.category ? ` (${o.category as string})` : ""}`,
          quantity: 1,
          unit_price: amount,
          amount,
          note: `手数料${feeRatePct}%: ${fmtJpy(fee)} / 施工店受取: ${fmtJpy(amount - fee)}`,
        };
      });

      const platformFeeTotal = Math.round(totalAmount * feeRate);
      const payoutTotal = totalAmount - platformFeeTotal;
      const noteLines = [
        `【合算請求書 — ${billingMonthStr}分】`,
        `対象案件数: ${tenantOrders.length}件`,
        `プラットフォーム手数料（${feeRatePct}%）計: ${fmtJpy(platformFeeTotal)}`,
        `施工店受取合計（${100 - feeRatePct}%）: ${fmtJpy(payoutTotal)}`,
        ``,
        `入金確認後、各施工店へ自動送金いたします。`,
      ];

      const invoiceData = {
        id: `monthly-${dateStr}-${fromTenantId.slice(0, 8)}`,
        invoice_number: invoiceNumber,
        status: "sent",
        issued_at: now.toISOString(),
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal: totalAmount,
        tax: 0,
        total: totalAmount,
        tax_rate: 0,
        items_json: items,
        note: noteLines.join("\n"),
        recipient_name: recipientCompany ?? recipientEmail,
        show_seal: false,
        show_logo: true,
        show_bank_info: !!tenant.bank_info,
      };

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await renderInvoicePdf(invoiceData, tenant, recipientCompany ?? null);
      } catch (e) {
        logger.error("[monthlyInvoice] pdf failed", { fromTenantId, error: String(e) });
        errors++;
        continue;
      }

      // メール送付
      const emailResult = await sendResendEmail({
        to: recipientEmail,
        subject: `【合算請求書】${invoiceNumber} — ${billingMonthStr}分（${tenantOrders.length}件）`,
        html: buildConsolidatedEmailHtml({
          invoiceNumber,
          requesterCompany: recipientCompany,
          totalAmount,
          orderCount: tenantOrders.length,
          dueDateStr,
          billingMonthStr,
        }),
        attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer.toString("base64") }],
        idempotencyKey: `monthly-invoice-${dateStr}-${fromTenantId}`,
      });

      if (!emailResult.ok) {
        logger.error("[monthlyInvoice] email failed", { fromTenantId, error: emailResult.error });
        errors++;
        continue;
      }

      // 全案件の invoice_sent_at を更新
      const nowIso = now.toISOString();
      await supabase
        .from("job_orders")
        .update({
          invoice_number: invoiceNumber,
          invoice_sent_at: nowIso,
          invoice_due_date: dueDate.toISOString().slice(0, 10),
          platform_fee_amount: null, // 個別ではなく合算で管理
          payout_amount: null,
        })
        .in("id", tenantOrders.map((o) => o.id));

      logger.info("[monthlyInvoice] sent", {
        fromTenantId,
        invoiceNumber,
        orderCount: tenantOrders.length,
        totalAmount,
        to: recipientEmail,
      });
      sent++;
    } catch (e) {
      logger.error("[monthlyInvoice] tenant processing failed", { fromTenantId, error: String(e) });
      errors++;
    }
  }

  return { sent, errors };
}
