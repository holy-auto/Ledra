import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { isResendFailure, sendResendEmail } from "@/lib/email/resendSend";
import { maskEmail } from "@/lib/logger";

type Supabase = ReturnType<typeof createServiceRoleAdmin>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * ショップ注文の受領/支払い完了メールを送信する。
 *
 * - kind="paid": Stripe Checkout 完了 webhook から呼ばれる
 * - kind="invoice": 請求書払いで注文が登録された直後に呼ばれる
 *
 * 受信先はテナントの owner/admin メンバーの auth email を解決して送信。
 * 該当ユーザーやメールアドレスが見つからない場合は warn ログのみ残してスキップする。
 */
export async function sendShopOrderEmail(params: {
  supabase: Supabase;
  tenantId: string;
  shopOrderId: string;
  kind: "paid" | "invoice";
  /** Stripe webhook 等の重複イベントを Resend 側で重複排除するためのキー */
  idempotencyKey?: string;
}): Promise<void> {
  const { supabase, tenantId, shopOrderId, kind, idempotencyKey } = params;

  const { data: order } = await supabase
    .from("shop_orders")
    .select("order_number, subtotal, tax, total")
    .eq("id", shopOrderId)
    .maybeSingle();

  if (!order) {
    console.warn("shopOrderEmail: skipped — order not found", { shopOrderId });
    return;
  }

  const { data: items } = await supabase
    .from("shop_order_items")
    .select("product_name, quantity, unit_price, amount")
    .eq("order_id", shopOrderId);

  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin", "super_admin"])
    .limit(1);

  if (!members?.[0]) {
    console.warn("shopOrderEmail: skipped — no owner/admin member found", { tenantId });
    return;
  }

  const { data: userData } = await supabase.auth.admin.getUserById(members[0].user_id);
  const email = userData?.user?.email;
  if (!email) {
    console.warn("shopOrderEmail: skipped — no email for user", {
      tenantId,
      userId: members[0].user_id,
    });
    return;
  }

  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  const ordersUrl = `${appUrl}/admin/shop/orders`;

  const headline = kind === "paid" ? "ご注文ありがとうございます" : "ご注文を受け付けました";
  const lead =
    kind === "paid"
      ? "お支払いが完了いたしました。"
      : "ご注文を受け付けました。請求書を別途お送りいたしますので、お支払いをお待ちください。";
  const subject =
    kind === "paid"
      ? `【Ledra】ご注文を承りました（${order.order_number}）`
      : `【Ledra】ご注文を受け付けました（${order.order_number}）`;
  const accentColor = kind === "paid" ? "#34c759" : "#0071e3";

  const itemsRowsHtml = (items ?? [])
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 0;color:#1d1d1f;">${escapeHtml(it.product_name)} × ${it.quantity}</td>
          <td style="padding:8px 0;color:#1d1d1f;text-align:right;">${yen(it.amount)}</td>
        </tr>`,
    )
    .join("");

  const itemsLinesText = (items ?? [])
    .map((it) => `・${it.product_name} × ${it.quantity}  ${yen(it.amount)}`)
    .join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid ${accentColor}; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">${headline}</h2>
      </div>
      <p style="color: #1d1d1f; line-height: 1.6;">
        ${lead}<br>
        注文番号: <strong>${escapeHtml(order.order_number)}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        ${itemsRowsHtml}
        <tr><td colspan="2" style="border-top:1px solid #e5e5e5;padding-top:8px;"></td></tr>
        <tr>
          <td style="padding:4px 0;color:#86868b;">小計</td>
          <td style="padding:4px 0;color:#86868b;text-align:right;">${yen(order.subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#86868b;">消費税</td>
          <td style="padding:4px 0;color:#86868b;text-align:right;">${yen(order.tax)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#1d1d1f;font-weight:600;">合計</td>
          <td style="padding:8px 0;color:#1d1d1f;font-weight:600;text-align:right;">${yen(order.total)}</td>
        </tr>
      </table>
      <p style="margin: 24px 0;">
        <a href="${ordersUrl}" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          注文履歴を見る
        </a>
      </p>
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra — 株式会社HOLY
      </div>
    </div>
  `;

  const text = `${headline}

${lead}
注文番号: ${order.order_number}

${itemsLinesText}

小計: ${yen(order.subtotal)}
消費税: ${yen(order.tax)}
合計: ${yen(order.total)}

注文履歴: ${ordersUrl}

---
Ledra — 株式会社HOLY
`;

  const sent = await sendResendEmail({
    to: email,
    reply_to: "support@ledra.co.jp",
    subject,
    html,
    text,
    idempotencyKey,
  });
  if (isResendFailure(sent)) {
    console.error("shopOrderEmail: send failed", {
      tenantId,
      shopOrderId,
      kind,
      emailMasked: maskEmail(email),
      status: sent.status,
    });
  } else {
    console.info("shopOrderEmail: sent", {
      tenantId,
      shopOrderId,
      kind,
      emailMasked: maskEmail(email),
      resendId: sent.id,
    });
  }
}
