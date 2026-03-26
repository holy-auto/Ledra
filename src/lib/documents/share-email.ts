/**
 * Document sharing email via Resend API.
 */

import { escapeHtml } from "@/lib/sanitize";

const RESEND_API = "https://api.resend.com/emails";

function wrap(title: string, body: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border-bottom: 2px solid #0071e3; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1d1d1f; font-size: 18px;">${title}</h2>
      </div>
      ${body}
      <div style="border-top: 1px solid #e5e5e5; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #86868b;">
        CARTRUST
      </div>
    </div>
  `;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 帳票共有メール送信 */
export async function sendDocumentEmail(params: {
  to: string;
  docType: string;
  docNumber: string;
  totalAmount: number;
  recipientName: string;
  senderName: string;
  message?: string;
  pdfUrl?: string;
}): Promise<boolean> {
  const docType = escapeHtml(params.docType);
  const docNumber = escapeHtml(params.docNumber);
  const recipient = escapeHtml(params.recipientName);
  const sender = escapeHtml(params.senderName);
  const amount = params.totalAmount.toLocaleString("ja-JP");

  const messageBlock = params.message
    ? `
      <div style="background: #f0f4ff; border-left: 3px solid #0071e3; padding: 12px; margin: 16px 0; font-size: 13px; color: #1d1d1f;">
        ${escapeHtml(params.message).replace(/\n/g, "<br>")}
      </div>
    `
    : "";

  const pdfBlock = params.pdfUrl
    ? `
      <div style="margin: 16px 0;">
        <a href="${escapeHtml(params.pdfUrl)}" style="display: inline-block; background: #0071e3; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px;">
          PDFを表示
        </a>
      </div>
    `
    : "";

  const html = wrap(
    `${docType}のご送付`,
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${recipient} 様<br><br>
        ${sender}より${docType}をお送りいたします。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        書類種別: <strong>${docType}</strong><br>
        書類番号: <strong>${docNumber}</strong><br>
        合計金額: <strong>&yen;${amount}</strong>
      </div>
      ${messageBlock}
      ${pdfBlock}
      <p style="font-size: 13px; color: #86868b;">
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </p>
    `,
  );

  return send(
    params.to,
    `[${sender}] ${docType} ${docNumber} のご送付`,
    html,
  );
}
