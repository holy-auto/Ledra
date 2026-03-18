/**
 * Market notification emails via Resend API
 * Gracefully degrades if RESEND_API_KEY is not set.
 */

import { escapeHtml } from "@/lib/sanitize";

const RESEND_API = "https://api.resend.com/emails";

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("[market/email] RESEND_API_KEY or RESEND_FROM not set, skipping email:", subject);
    return;
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[market/email] send failed:", res.status, text);
    }
  } catch (e) {
    console.error("[market/email] send error:", e);
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
        CARTRUST - HolyMarket
      </div>
    </div>
  `;
}

/** Notify seller when a new inquiry is received */
export async function notifyNewInquiry(
  sellerEmail: string,
  data: { buyerName: string; buyerCompany?: string; vehicleLabel: string; message: string },
) {
  const name = escapeHtml(data.buyerName);
  const company = data.buyerCompany ? ` (${escapeHtml(data.buyerCompany)})` : "";
  const vehicle = escapeHtml(data.vehicleLabel);
  const msg = escapeHtml(data.message).replace(/\n/g, "<br>");
  const html = wrap(
    "新しいお問い合わせが届きました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${name}</strong>${company} 様から
        「<strong>${vehicle}</strong>」に関するお問い合わせが届きました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        ${msg}
      </div>
      <p style="font-size: 13px; color: #86868b;">管理画面の「問い合わせ管理」から返信してください。</p>
    `,
  );
  await sendEmail(sellerEmail, `[HolyMarket] 新規問い合わせ: ${vehicle}`, html);
}

/** Notify buyer when seller replies to inquiry */
export async function notifyInquiryReply(
  buyerEmail: string,
  data: { sellerName: string; vehicleLabel: string; message: string },
) {
  const seller = escapeHtml(data.sellerName);
  const vehicle = escapeHtml(data.vehicleLabel);
  const msg = escapeHtml(data.message).replace(/\n/g, "<br>");
  const html = wrap(
    "お問い合わせに返信がありました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${seller}</strong> から
        「<strong>${vehicle}</strong>」に関する返信が届きました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        ${msg}
      </div>
    `,
  );
  await sendEmail(buyerEmail, `[HolyMarket] 返信: ${vehicle}`, html);
}

/** Notify buyer when a deal is started */
export async function notifyDealStarted(
  buyerEmail: string,
  data: { sellerName: string; vehicleLabel: string; agreedPrice?: number },
) {
  const seller = escapeHtml(data.sellerName);
  const vehicle = escapeHtml(data.vehicleLabel);
  const priceStr = data.agreedPrice ? `¥${data.agreedPrice.toLocaleString("ja-JP")}` : "未定";
  const html = wrap(
    "商談が開始されました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${seller}</strong> が
        「<strong>${vehicle}</strong>」について商談を開始しました。
      </p>
      <p style="color: #1d1d1f; font-size: 14px;">提示価格: <strong>${priceStr}</strong></p>
    `,
  );
  await sendEmail(buyerEmail, `[HolyMarket] 商談開始: ${vehicle}`, html);
}

/** Notify both parties when deal status changes */
export async function notifyDealStatusChanged(
  email: string,
  data: { vehicleLabel: string; newStatus: string; otherPartyName: string },
) {
  const statusLabels: Record<string, string> = {
    agreed: "合意",
    completed: "完了",
    cancelled: "キャンセル",
  };
  const label = statusLabels[data.newStatus] ?? escapeHtml(data.newStatus);
  const vehicle = escapeHtml(data.vehicleLabel);
  const otherParty = escapeHtml(data.otherPartyName);
  const html = wrap(
    `商談ステータスが「${label}」に変更されました`,
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        「<strong>${vehicle}</strong>」の商談ステータスが
        <strong>${label}</strong> に変更されました。
      </p>
      <p style="color: #86868b; font-size: 13px;">相手方: ${otherParty}</p>
    `,
  );
  await sendEmail(email, `[HolyMarket] 商談${label}: ${vehicle}`, html);
}

/** Notify dealer that their account was approved */
export async function notifyDealerApproved(email: string, companyName: string) {
  const company = escapeHtml(companyName);
  const html = wrap(
    "アカウントが承認されました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${company}</strong> のHolyMarketアカウントが承認されました。
        BtoB在庫共有をご利用いただけます。
      </p>
    `,
  );
  await sendEmail(email, "[HolyMarket] アカウント承認完了", html);
}

/** Notify dealer that their account was suspended */
export async function notifyDealerSuspended(email: string, companyName: string, reason?: string) {
  const company = escapeHtml(companyName);
  const html = wrap(
    "アカウントが停止されました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${company}</strong> のHolyMarketアカウントが停止されました。
      </p>
      ${reason ? `<p style="color: #86868b; font-size: 13px;">理由: ${escapeHtml(reason)}</p>` : ""}
      <p style="color: #86868b; font-size: 13px;">詳細はサポートまでお問い合わせください。</p>
    `,
  );
  await sendEmail(email, "[HolyMarket] アカウント停止のお知らせ", html);
}

/** Notify about new vehicle listing (for future use) */
export async function notifyNewListing(
  emails: string[],
  data: { vehicleLabel: string; sellerName: string; askingPrice?: number },
) {
  if (emails.length === 0) return;
  const seller = escapeHtml(data.sellerName);
  const vehicle = escapeHtml(data.vehicleLabel);
  const priceStr = data.askingPrice ? `¥${data.askingPrice.toLocaleString("ja-JP")}` : "未設定";
  const html = wrap(
    "新しい車両が出品されました",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        <strong>${seller}</strong> が新しい車両を出品しました。
      </p>
      <p style="color: #1d1d1f; font-size: 14px;">
        車両: <strong>${vehicle}</strong><br>
        価格: <strong>${priceStr}</strong>
      </p>
    `,
  );
  for (const email of emails) {
    await sendEmail(email, `[HolyMarket] 新規出品: ${vehicle}`, html);
  }
}
