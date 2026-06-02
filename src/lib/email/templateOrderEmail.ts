import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { isResendFailure, sendResendEmail } from "@/lib/email/resendSend";
import { maskEmail } from "@/lib/logger";
import type { TemplateOrderType } from "@/types/templateOption";

type Supabase = ReturnType<typeof createServiceRoleAdmin>;

const ORDER_TYPE_LABELS: Record<TemplateOrderType, string> = {
  preset_setup: "テンプレート設定",
  custom_production: "カスタム制作",
  modification: "修正対応",
  additional: "追加発注",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function resolveTenantOwnerEmail(supabase: Supabase, tenantId: string): Promise<string | null> {
  const { data: members } = await supabase
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "admin", "super_admin"])
    .limit(1);

  if (!members?.[0]) return null;

  const { data: userData } = await supabase.auth.admin.getUserById(members[0].user_id);
  return userData?.user?.email ?? null;
}

/**
 * テンプレートオーダー作成時の確認メール。
 *
 * - kind="paid": 即時購入（preset_setup / modification / additional）の確認
 * - kind="pending_payment": custom_production など決済待ちの注文受付
 */
export async function sendTemplateOrderConfirmationEmail(params: {
  supabase: Supabase;
  tenantId: string;
  orderId: string;
  orderType: TemplateOrderType;
  amount: number;
  kind: "paid" | "pending_payment";
}): Promise<void> {
  const { supabase, tenantId, orderId, orderType, amount, kind } = params;

  const email = await resolveTenantOwnerEmail(supabase, tenantId);
  if (!email) {
    console.warn("templateOrderEmail: skipped — no tenant owner email", { tenantId, orderId });
    return;
  }

  const yen = `¥${amount.toLocaleString("ja-JP")}`;
  const typeLabel = ORDER_TYPE_LABELS[orderType] ?? orderType;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  const orderUrl = `${appUrl}/admin/template-options/order`;

  const headline = kind === "paid" ? "ご購入ありがとうございます" : "ご注文を受け付けました";
  const lead =
    kind === "paid"
      ? `${typeLabel}のお申し込みを承りました。担当よりヒアリング・進行のご連絡をいたします。`
      : `${typeLabel}のお申し込みを受け付けました。お支払い案内を別途ご連絡いたします。`;
  const subject =
    kind === "paid"
      ? `【Ledra】${typeLabel}のお申し込みを承りました`
      : `【Ledra】${typeLabel}のお申し込みを受け付けました`;
  const accentColor = kind === "paid" ? "#34c759" : "#0071e3";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid ${accentColor};padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">${headline}</h2>
      </div>
      <p style="color:#1d1d1f;line-height:1.6;">${escapeHtml(lead)}</p>
      <div style="background:#f5f5f7;border-radius:8px;padding:12px;margin:16px 0;font-size:14px;color:#1d1d1f;">
        オーダー種別: <strong>${escapeHtml(typeLabel)}</strong><br>
        金額: <strong>${yen}（税抜）</strong>
      </div>
      <p style="margin:24px 0;">
        <a href="${orderUrl}" style="display:inline-block;background:#0071e3;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;">
          オーダー画面を開く
        </a>
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra — 株式会社HOLY
      </div>
    </div>
  `;

  const text = `${headline}

${lead}

オーダー種別: ${typeLabel}
金額: ${yen}（税抜）

オーダー画面: ${orderUrl}

---
Ledra — 株式会社HOLY
`;

  const sent = await sendResendEmail({
    to: email,
    reply_to: "support@ledra.co.jp",
    subject,
    html,
    text,
    idempotencyKey: `template-order:${kind}:${orderId}`,
  });
  if (isResendFailure(sent)) {
    console.error("templateOrderEmail: send failed", {
      tenantId,
      orderId,
      kind,
      emailMasked: maskEmail(email),
      status: sent.status,
    });
  } else {
    console.info("templateOrderEmail: sent", {
      tenantId,
      orderId,
      kind,
      emailMasked: maskEmail(email),
      resendId: sent.id,
    });
  }
}

/**
 * テンプレートオプションのサブスクが Stripe 経由で開始された際の確認メール。
 */
export async function sendTemplateSubscriptionStartedEmail(params: {
  supabase: Supabase;
  tenantId: string;
  optionType: "preset" | "custom";
  idempotencyKey: string;
}): Promise<void> {
  const { supabase, tenantId, optionType, idempotencyKey } = params;

  const email = await resolveTenantOwnerEmail(supabase, tenantId);
  if (!email) {
    console.warn("templateSubscriptionStartedEmail: skipped — no tenant owner email", { tenantId });
    return;
  }

  const optionLabel = optionType === "preset" ? "プリセットテンプレート" : "カスタムテンプレート";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  const settingsUrl = `${appUrl}/admin/template-options`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="border-bottom:2px solid #34c759;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;color:#1d1d1f;font-size:18px;">サブスクリプションを開始しました</h2>
      </div>
      <p style="color:#1d1d1f;line-height:1.6;">
        ${escapeHtml(optionLabel)}のサブスクリプションが開始されました。<br>
        管理画面からテンプレートのご利用が可能です。
      </p>
      <p style="margin:24px 0;">
        <a href="${settingsUrl}" style="display:inline-block;background:#0071e3;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;">
          テンプレート設定を開く
        </a>
      </p>
      <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
        Ledra — 株式会社HOLY
      </div>
    </div>
  `;

  const text = `サブスクリプションを開始しました

${optionLabel}のサブスクリプションが開始されました。
管理画面からテンプレートのご利用が可能です。

テンプレート設定: ${settingsUrl}

---
Ledra — 株式会社HOLY
`;

  const sent = await sendResendEmail({
    to: email,
    reply_to: "support@ledra.co.jp",
    subject: "【Ledra】テンプレートオプションを開始しました",
    html,
    text,
    idempotencyKey,
  });
  if (isResendFailure(sent)) {
    console.error("templateSubscriptionStartedEmail: send failed", {
      tenantId,
      emailMasked: maskEmail(email),
      status: sent.status,
    });
  } else {
    console.info("templateSubscriptionStartedEmail: sent", {
      tenantId,
      emailMasked: maskEmail(email),
      resendId: sent.id,
    });
  }
}
