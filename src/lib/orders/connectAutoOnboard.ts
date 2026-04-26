import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email/resendSend";
import { logger } from "@/lib/logger";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
  });
}

function buildOnboardingEmailHtml(params: {
  shopName: string;
  orderTitle: string;
  invoiceNumber: string | null;
  payoutAmount: number;
  onboardingUrl: string;
}): string {
  const { shopName, orderTitle, invoiceNumber, payoutAmount, onboardingUrl } = params;
  const fmtJpy = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f9fc;font-family:'Helvetica Neue',Arial,sans-serif;color:#333">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:#1a1f36;padding:24px 32px">
      <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700">Ledra BtoB — 振込先口座の登録をお願いします</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px">${shopName ? `${shopName} ご担当者様` : "ご担当者様"}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7">
        受注案件のお支払いを処理するため、振込先口座の登録をお願いいたします。<br>
        登録は<strong>約5分</strong>で完了します。登録後に自動で振込が実行されます。
      </p>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 12px;font-size:13px;color:#166534;font-weight:600">お支払い予定の案件</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${invoiceNumber ? `<tr><td style="color:#888;padding:4px 0;width:110px">請求書番号</td><td style="font-weight:600">${invoiceNumber}</td></tr>` : ""}
          <tr><td style="color:#888;padding:4px 0">件名</td><td>${orderTitle}</td></tr>
          <tr><td style="color:#888;padding:4px 0">振込予定金額</td><td style="font-size:17px;font-weight:700;color:#166534">${fmtJpy(payoutAmount)}</td></tr>
        </table>
      </div>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${onboardingUrl}"
          style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;letter-spacing:0.02em">
          振込先口座を登録する（約5分）
        </a>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:14px;font-size:12px;color:#92400e;line-height:1.7">
        <strong>登録の流れ</strong><br>
        1. 上のボタンをクリック<br>
        2. Stripeの画面で銀行口座・本人確認情報を入力（約5分）<br>
        3. 登録完了後、自動で振込が実行されます<br>
        <br>
        ※ このリンクの有効期限は24時間です。期限切れの場合は管理画面 → 設定 → 振込口座から再登録できます。
      </div>
    </div>
    <div style="background:#f6f9fc;padding:16px 32px;font-size:11px;color:#aaa;text-align:center">
      © Ledra — BtoBプラットフォーム
    </div>
  </div>
</body>
</html>`;
}

/**
 * 施工店（to_tenant）の Stripe Connect アカウントを自動作成し、
 * オンボーディングリンクをメールで送付する。
 * job_order の payout_stripe_transfer_id を 'pending_onboarding' にセットする。
 */
export async function ensureConnectAndNotify(toTenantId: string, orderId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: shop } = await supabase
    .from("tenants")
    .select("id, name, contact_email, stripe_connect_account_id, stripe_connect_onboarded")
    .eq("id", toTenantId)
    .single();

  if (!shop?.contact_email) {
    logger.warn("[connectAutoOnboard] no contact_email, skipping", { toTenantId, orderId });
    return;
  }

  // 既にオンボーディング済みなら何もしない
  if (shop.stripe_connect_onboarded && shop.stripe_connect_account_id) {
    return;
  }

  const stripe = getStripe();
  let accountId = shop.stripe_connect_account_id as string | null;

  // アカウントがなければ Express で自動作成
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "JP",
      business_profile: {
        name: (shop.name as string) || undefined,
      },
      capabilities: {
        transfers: { requested: true },
      },
    });
    accountId = account.id;
    await supabase
      .from("tenants")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", toTenantId);
    logger.info("[connectAutoOnboard] express account created", { toTenantId, accountId });
  }

  // オンボーディングリンク生成
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: `${baseUrl}/admin/settings?connect=success`,
    refresh_url: `${baseUrl}/admin/settings?connect=refresh`,
    type: "account_onboarding",
  });

  // 案件情報を取得してメールに含める
  const { data: order } = await supabase
    .from("job_orders")
    .select("title, payout_amount, invoice_number")
    .eq("id", orderId)
    .single();

  const emailResult = await sendResendEmail({
    to: shop.contact_email as string,
    subject: `【振込口座の登録をお願いします】${order?.invoice_number ? `${order.invoice_number} - ` : ""}${order?.title ?? ""}`,
    html: buildOnboardingEmailHtml({
      shopName: (shop.name as string) || "",
      orderTitle: (order?.title as string) || "",
      invoiceNumber: (order?.invoice_number as string | null) ?? null,
      payoutAmount: (order?.payout_amount as number) || 0,
      onboardingUrl: accountLink.url,
    }),
    idempotencyKey: `connect-onboard-${orderId}`,
  });

  if (!emailResult.ok) {
    logger.error("[connectAutoOnboard] email send failed", { toTenantId, orderId, error: emailResult.error });
    return;
  }

  // 送金待ちフラグをセット
  await supabase
    .from("job_orders")
    .update({ payout_stripe_transfer_id: "pending_onboarding" })
    .eq("id", orderId);

  logger.info("[connectAutoOnboard] onboarding email sent", {
    toTenantId,
    orderId,
    accountId,
    to: shop.contact_email,
  });
}
