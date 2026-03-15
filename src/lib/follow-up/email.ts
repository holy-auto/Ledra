/**
 * Follow-up & expiry reminder emails via Resend API.
 */

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

/** 有効期限リマインダーメール */
export async function sendExpiryReminder(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  certificateLabel: string;
  expiryDate: string;
  daysUntil: number;
}): Promise<boolean> {
  const urgency = params.daysUntil <= 1 ? "本日" : `${params.daysUntil}日後`;
  const html = wrap(
    "施工証明書の有効期限のお知らせ",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${params.customerName} 様<br><br>
        ${params.shopName}よりご案内いたします。<br>
        以下の施工証明書の有効期限が <strong>${urgency}</strong> に迫っております。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        施工内容: <strong>${params.certificateLabel}</strong><br>
        有効期限: <strong>${params.expiryDate}</strong>
      </div>
      <p style="font-size: 13px; color: #86868b;">
        再施工のご予約は ${params.shopName} までお気軽にお問い合わせください。
      </p>
    `,
  );
  return send(
    params.customerEmail,
    `[${params.shopName}] 施工証明書の有効期限のお知らせ`,
    html,
  );
}

/** 施工後フォローメール */
export async function sendFollowUpEmail(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  certificateLabel: string;
  daysSince: number;
}): Promise<boolean> {
  const html = wrap(
    "施工後のフォローアップ",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${params.customerName} 様<br><br>
        ${params.shopName}です。<br>
        「${params.certificateLabel}」の施工から約${params.daysSince}日が経過いたしました。<br>
        施工の状態はいかがでしょうか？
      </p>
      <p style="color: #1d1d1f; font-size: 14px;">
        メンテナンスやお手入れについてご不明な点がございましたら、お気軽にお問い合わせください。
      </p>
      <p style="font-size: 13px; color: #86868b;">
        今後ともよろしくお願いいたします。
      </p>
    `,
  );
  return send(
    params.customerEmail,
    `[${params.shopName}] 施工後のご確認`,
    html,
  );
}
