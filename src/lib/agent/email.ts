/**
 * Agent application notification emails via Resend API.
 * Gracefully degrades if RESEND_API_KEY is not set.
 */

import { escapeHtml } from "@/lib/sanitize";
import { isResendFailure, sendResendEmail } from "@/lib/email/resendSend";

async function sendEmail(to: string, subject: string, html: string, idempotencyKey?: string) {
  const r = await sendResendEmail({ to, subject, html, idempotencyKey });
  if (isResendFailure(r)) {
    console.error("[agent/email] send failed:", { subject, status: r.status, error: r.error });
  }
}

function wrap(title: string, body: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">${title}</h2>
      </div>
      ${body}
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        Ledra
      </div>
    </div>
  `;
}

/** Notify applicant that application was received */
export async function notifyApplicationReceived(
  email: string,
  data: { companyName: string; applicationNumber: string },
) {
  const company = escapeHtml(data.companyName);
  const appNum = escapeHtml(data.applicationNumber);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.ledra.co.jp";
  const statusUrl = `${baseUrl}/agent/apply/status`;
  const html = wrap(
    "代理店申請を受け付けました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${company}</strong> 様の代理店パートナー申請を受け付けました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 13px; color: #86868b;">申請番号</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-family: monospace; color: #1d1d1f; font-weight: 600;">${appNum}</p>
      </div>
      <p style="color: #1d1d1f; font-size: 14px;">
        審査には通常3〜5営業日ほどお時間をいただきます。結果はメールにてお知らせいたします。
      </p>
      <p style="font-size: 13px; color: #86868b;">
        申請状況は<a href="${escapeHtml(statusUrl)}" style="color: #0071e3;">こちら</a>から確認できます。
      </p>
    `,
  );
  await sendEmail(email, `[Ledra] 代理店申請受付: ${appNum}`, html);
}

/** Notify applicant that application was approved */
export async function notifyApplicationApproved(
  email: string,
  data: {
    companyName: string;
    loginEmail: string;
    temporaryPassword: string;
    portalUrl: string;
  },
) {
  const company = escapeHtml(data.companyName);
  const loginEmail = escapeHtml(data.loginEmail);
  const password = escapeHtml(data.temporaryPassword);
  const portalUrl = escapeHtml(data.portalUrl);
  const html = wrap(
    "代理店申請が承認されました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${company}</strong> 様の代理店パートナー申請が承認されました。
        以下の情報でポータルにログインしてください。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #86868b;">ログイン情報</p>
        <p style="margin: 0; font-size: 14px; color: #1d1d1f;">メールアドレス: <strong>${loginEmail}</strong></p>
        <p style="margin: 4px 0 0; font-size: 14px; color: #1d1d1f;">仮パスワード: <strong style="font-family: monospace;">${password}</strong></p>
      </div>
      <p style="color: #1d1d1f; font-size: 14px;">
        <a href="${portalUrl}" style="display: inline-block; background: #0071e3; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">ポータルにログイン</a>
      </p>
      <p style="font-size: 13px; color: #86868b;">
        ログイン後、Stripe Connect の設定を完了してください。コミッションの受取に必要です。
      </p>
      <p style="font-size: 13px; color: #d00;">
        セキュリティのため、初回ログイン後にパスワードを変更してください。
      </p>
    `,
  );
  await sendEmail(email, "[Ledra] 代理店申請承認 - ログイン情報のご案内", html);
}

/** Notify a signer that a new agent contract awaits their signature. */
export async function notifyAgentSignRequest(
  email: string,
  data: {
    signerName: string;
    title: string;
    signUrl: string;
    /** ISO-8601 timestamp. Used for display only. */
    expiresAt: string;
    /** Stable key to dedupe reminder/resend flows within Resend's 24h window. */
    idempotencyKey?: string;
  },
) {
  const name = escapeHtml(data.signerName);
  const title = escapeHtml(data.title);
  const signUrl = escapeHtml(data.signUrl);
  const expiresDisplay = escapeHtml(new Date(data.expiresAt).toLocaleString("ja-JP"));
  const html = wrap(
    "電子署名のお願い",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${name} 様<br /><br />
        Ledra より「<strong>${title}</strong>」の電子署名をお願いいたします。
      </p>
      <p style="margin: 20px 0;">
        <a href="${signUrl}" style="display: inline-block; background: #0071e3; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">署名する</a>
      </p>
      <p style="font-size: 13px; color: #86868b;">
        このリンクは <strong>${expiresDisplay}</strong> まで有効です。
      </p>
      <p style="font-size: 12px; color: #86868b; word-break: break-all;">
        もしボタンが開けない場合は、以下のURLをブラウザに貼り付けてください。<br />
        ${signUrl}
      </p>
    `,
  );
  await sendEmail(email, `[Ledra] 電子署名のお願い: ${data.title}`, html, data.idempotencyKey);
}

/** Notify applicant that application was rejected */
export async function notifyApplicationRejected(
  email: string,
  data: {
    companyName: string;
    applicationNumber: string;
    rejectionReason: string;
  },
) {
  const company = escapeHtml(data.companyName);
  const appNum = escapeHtml(data.applicationNumber);
  const reason = escapeHtml(data.rejectionReason).replace(/\n/g, "<br>");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.ledra.co.jp";
  const reapplyUrl = `${baseUrl}/agent/apply`;
  const html = wrap(
    "代理店申請について",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${company}</strong> 様の代理店パートナー申請（${appNum}）について審査を行いましたが、
        今回は承認を見送らせていただくこととなりました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #86868b;">審査結果の詳細</p>
        <p style="margin: 0; font-size: 14px; color: #1d1d1f;">${reason}</p>
      </div>
      <p style="color: #1d1d1f; font-size: 14px;">
        内容を修正の上、再度申請いただくことも可能です。
      </p>
      <p style="font-size: 14px;">
        <a href="${escapeHtml(reapplyUrl)}" style="color: #0071e3;">再申請はこちら</a>
      </p>
    `,
  );
  await sendEmail(email, `[Ledra] 代理店申請の審査結果: ${appNum}`, html);
}
