/**
 * Document sharing email via Resend API.
 */

import { escapeHtml } from "@/lib/sanitize";
import { sendEmail } from "@/lib/email/sendEmail";

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

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await sendEmail({ from, to, subject, html });
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
  /** 同封する他の帳票（帳票管理画面から追加選択された分） */
  additionalDocuments?: { docType: string; docNumber: string; totalAmount: number }[];
}): Promise<boolean> {
  const docType = escapeHtml(params.docType);
  const docNumber = escapeHtml(params.docNumber);
  const recipient = escapeHtml(params.recipientName);
  const sender = escapeHtml(params.senderName);
  const amount = params.totalAmount.toLocaleString("ja-JP");
  const additionalDocuments = params.additionalDocuments ?? [];

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

  const allDocs = [
    { docType: params.docType, docNumber: params.docNumber, totalAmount: params.totalAmount },
    ...additionalDocuments,
  ];

  const docsBlock =
    allDocs.length > 1
      ? `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        <thead>
          <tr style="background: #f5f5f7;">
            <th style="text-align: left; padding: 8px;">書類種別</th>
            <th style="text-align: left; padding: 8px;">書類番号</th>
            <th style="text-align: right; padding: 8px;">金額</th>
          </tr>
        </thead>
        <tbody>
          ${allDocs
            .map(
              (d) => `
            <tr style="border-bottom: 1px solid #e5e5e5;">
              <td style="padding: 8px;">${escapeHtml(d.docType)}</td>
              <td style="padding: 8px;">${escapeHtml(d.docNumber)}</td>
              <td style="padding: 8px; text-align: right;">&yen;${d.totalAmount.toLocaleString("ja-JP")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `
      : `
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        書類種別: <strong>${docType}</strong><br>
        書類番号: <strong>${docNumber}</strong><br>
        合計金額: <strong>&yen;${amount}</strong>
      </div>
    `;

  const title = allDocs.length > 1 ? `${docType}ほかのご送付` : `${docType}のご送付`;
  const subject =
    allDocs.length > 1
      ? `[${sender}] ${docType} ${docNumber} 他${allDocs.length - 1}件のご送付`
      : `[${sender}] ${docType} ${docNumber} のご送付`;

  const html = wrap(
    title,
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${recipient} 様<br><br>
        ${sender}より${docType}${allDocs.length > 1 ? "ほか" : ""}をお送りいたします。
      </p>
      ${docsBlock}
      ${messageBlock}
      ${pdfBlock}
      <p style="font-size: 13px; color: #86868b;">
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </p>
    `,
  );

  return send(params.to, subject, html);
}
