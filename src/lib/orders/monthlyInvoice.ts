import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { renderInvoicePdf, type TenantForPdf } from "@/lib/pdfInvoice";
import { sendResendEmail } from "@/lib/email/resendSend";
import { logger } from "@/lib/logger";
import { todayJst } from "@/lib/gantt/board";

function fmtJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
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
  const supabase = createServiceRoleAdmin("orders/monthlyInvoice: 月次合算請求 (全テナントの job_order を跨いで集計)");
  const now = targetDate ?? new Date();

  // 月境界は JST 基準で決める（UTC 深夜だと締め月が前月に寄り、月初/月末の
  // 案件が別月に混入する）。
  const jstYmd = todayJst(now); // "YYYY-MM-DD" (JST)
  const jy = Number(jstYmd.slice(0, 4));
  const jm = Number(jstYmd.slice(5, 7)); // 1-12
  const ym = jstYmd.slice(0, 7); // "YYYY-MM"

  // 対象月（例: "2026年4月"）
  const billingMonthStr = `${jy}年${jm}月`;

  // 当月1日 00:00 〜 翌月1日 00:00（排他上限）を JST で表現。
  const monthStart = `${ym}-01T00:00:00+09:00`;
  const nextYm = jm === 12 ? `${jy + 1}-01` : `${jy}-${String(jm + 1).padStart(2, "0")}`;
  const monthEnd = `${nextYm}-01T00:00:00+09:00`;

  // 支払期限 = 翌月末（JST）。翌々月の 0 日目 = 翌月末日。
  const dueYear = jm === 12 ? jy + 1 : jy;
  const dueMonth = jm === 12 ? 1 : jm + 1; // 1-12
  const dueLast = new Date(Date.UTC(dueYear, dueMonth, 0)); // 翌月末日 (UTC 固定で日付ズレ回避)
  const dueDateIso = dueLast.toISOString().slice(0, 10);
  const dueDateStr = `${dueYear}/${dueMonth}/${dueLast.getUTCDate()}`;

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
    // 指名(invoice)は請求書払いで cycleInvoice/orderInvoice が持つ。月次(platform)合算の対象外にし
    // 二重請求を防ぐ。
    .neq("billing_method", "invoice")
    .eq("status", "payment_pending")
    .is("invoice_sent_at", null)
    .gte("client_approved_at", monthStart)
    .lt("client_approved_at", monthEnd);

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

      // 請求書番号（例: CINV-202604-1A2B3C4D5E6F）
      // ponytail: テナント UUID 先頭 12 hex を採番に使う簡易方式。DB シーケンス等の
      //   永続採番は未実装で、真の一意性は保証しない（4 hex では衝突しやすかったのを
      //   12 hex に広げ実用上の衝突確率を無視できる水準にする）。月次×テナントで
      //   採番を永続化する場合は別途シーケンス/採番テーブルへ移行する。
      const dateStr = ym.replace("-", ""); // YYYYMM (JST)
      const shortId = fromTenantId.replace(/-/g, "").slice(0, 12).toUpperCase();
      const invoiceNumber = `CINV-${dateStr}-${shortId}`;

      // 施工店情報（最初の受注テナントを代表として使用）
      const tenant = firstOrder.to_tenant as unknown as TenantForPdf | null;
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
        due_date: dueDateIso,
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
          invoice_due_date: dueDateIso,
          platform_fee_amount: null, // 個別ではなく合算で管理
          payout_amount: null,
        })
        .in(
          "id",
          tenantOrders.map((o) => o.id),
        );

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
