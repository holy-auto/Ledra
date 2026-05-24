/**
 * Follow-up & expiry reminder emails via Resend API.
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

/** 有効期限リマインダーメール */
export async function sendExpiryReminder(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  certificateLabel: string;
  expiryDate: string;
  daysUntil: number;
}): Promise<boolean> {
  const shop = escapeHtml(params.shopName);
  const customer = escapeHtml(params.customerName);
  const cert = escapeHtml(params.certificateLabel);
  const expiry = escapeHtml(params.expiryDate);
  const urgency = params.daysUntil <= 1 ? "本日" : `${params.daysUntil}日後`;
  const html = wrap(
    "施工証明書の有効期限のお知らせ",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${customer} 様<br><br>
        ${shop}よりご案内いたします。<br>
        以下の施工証明書の有効期限が <strong>${urgency}</strong> に迫っております。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        施工内容: <strong>${cert}</strong><br>
        有効期限: <strong>${expiry}</strong>
      </div>
      <p style="font-size: 13px; color: #86868b;">
        再施工のご予約は ${shop} までお気軽にお問い合わせください。
      </p>
    `,
  );
  return send(params.customerEmail, `[${shop}] 施工証明書の有効期限のお知らせ`, html);
}

/** 施工後フォローメール */
export async function sendFollowUpEmail(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  certificateLabel: string;
  daysSince: number;
}): Promise<boolean> {
  const shop = escapeHtml(params.shopName);
  const customer = escapeHtml(params.customerName);
  const cert = escapeHtml(params.certificateLabel);
  const html = wrap(
    "施工後のフォローアップ",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${customer} 様<br><br>
        ${shop}です。<br>
        「${cert}」の施工から約${params.daysSince}日が経過いたしました。<br>
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
  return send(params.customerEmail, `[${shop}] 施工後のご確認`, html);
}

/**
 * 低在庫アラートメール（テナント運営者向け）
 *
 * cron が日次で `inventory_items.current_stock <= min_stock` の品目を
 * 集約して 1 通にまとめて送る。品目が増減しても 1 通に集約することで
 * 通知疲れを防ぐ。
 */
export async function sendLowStockAlert(params: {
  shopName: string;
  recipientEmail: string;
  items: Array<{
    name: string;
    sku: string | null;
    current_stock: number;
    min_stock: number;
    unit: string;
  }>;
}): Promise<boolean> {
  if (params.items.length === 0) return false;
  const shop = escapeHtml(params.shopName);
  const rows = params.items
    .map((it) => {
      const name = escapeHtml(it.name);
      const sku = it.sku ? escapeHtml(it.sku) : "";
      const unit = escapeHtml(it.unit);
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${name}${sku ? `<br><span style="font-size:11px;color:#86868b;">${sku}</span>` : ""}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align:right; color:#c00; font-weight:700;">${it.current_stock} ${unit}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align:right; color:#86868b;">${it.min_stock} ${unit}</td>
        </tr>`;
    })
    .join("");
  const html = wrap(
    "在庫不足アラート",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${shop} 各位<br><br>
        以下の品目が最低在庫を下回っています。発注のご検討をお願いいたします。
      </p>
      <table style="width:100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;">
        <thead>
          <tr style="background:#f5f5f7;">
            <th style="padding: 10px 12px; text-align:left; font-size:11px; color:#86868b;">品目 / SKU</th>
            <th style="padding: 10px 12px; text-align:right; font-size:11px; color:#86868b;">現在庫</th>
            <th style="padding: 10px 12px; text-align:right; font-size:11px; color:#86868b;">最低在庫</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size: 12px; color: #86868b;">
        ※ 詳細・発注は管理画面 → 在庫管理 からご確認ください。
      </p>
    `,
  );
  return send(params.recipientEmail, `[${shop}] 在庫不足アラート (${params.items.length}件)`, html);
}

/**
 * 定期メンテナンスリマインダー（6/12 ヶ月点検）
 *
 * recoat_proposal とは別の意図 — 「再施工してください」ではなく
 * 「点検にいらしてください」というトーンで送る。月単位の節目
 * (半年点検 / 1 年点検) で使う。
 */
export async function sendMaintenanceReminder(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  certificateLabel: string;
  monthsSince: number;
}): Promise<boolean> {
  const shop = escapeHtml(params.shopName);
  const customer = escapeHtml(params.customerName);
  const cert = escapeHtml(params.certificateLabel);
  const milestone =
    params.monthsSince === 6 ? "半年" : params.monthsSince === 12 ? "1 年" : `${params.monthsSince} ヶ月`;
  const html = wrap(
    `${milestone}メンテナンスのご案内`,
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${customer} 様<br><br>
        ${shop}です。<br>
        「${cert}」の施工から <strong>${milestone}</strong> が経過いたしました。
      </p>
      <p style="color: #1d1d1f; font-size: 14px;">
        被膜・コーティングの状態確認や、撥水性能の回復メンテナンスのため、
        ${milestone}点検にお越しいただくことをおすすめしております。
      </p>
      <p style="font-size: 13px; color: #86868b;">
        ご予約・お問い合わせは ${shop} まで。
      </p>
    `,
  );
  return send(params.customerEmail, `[${shop}] ${milestone}メンテナンスのご案内`, html);
}

/**
 * 車検前メンテナンスリマインダー
 *
 * 車検証 OCR で抽出した inspection_expiry_date の N 日前に
 * 「車検の前にコーティング/PPF のメンテナンスはいかがですか」と
 * 提案するメール。follow_up_settings.inspection_pre_days で
 * テナント毎の発送タイミングを制御する (既定 60 日)。
 */
export async function sendInspectionReminder(params: {
  shopName: string;
  customerEmail: string;
  customerName: string;
  vehicleLabel: string;
  expiryDate: string; // YYYY-MM-DD
  daysUntil: number;
}): Promise<boolean> {
  const shop = escapeHtml(params.shopName);
  const customer = escapeHtml(params.customerName);
  const vehicle = escapeHtml(params.vehicleLabel);
  const expiry = escapeHtml(params.expiryDate);
  const urgency =
    params.daysUntil <= 7
      ? "間もなく"
      : params.daysUntil <= 30
        ? `${params.daysUntil} 日後`
        : `約${Math.round(params.daysUntil / 30)} ヶ月後`;
  const html = wrap(
    "車検前メンテナンスのご案内",
    `
      <p style="color: #1d1d1f; font-size: 14px;">
        ${customer} 様<br><br>
        ${shop}です。<br>
        お車 (<strong>${vehicle}</strong>) の車検満了日が <strong>${urgency}</strong> (${expiry}) に近づいております。
      </p>
      <p style="color: #1d1d1f; font-size: 14px;">
        車検前に以下のメンテナンスをご検討いただくと、車検後もより長く綺麗にお乗りいただけます:
      </p>
      <ul style="color: #1d1d1f; font-size: 14px; padding-left: 20px; margin: 12px 0;">
        <li>コーティングの撥水性能チェック・再施工</li>
        <li>PPF (プロテクションフィルム) の点検・部分張り替え</li>
        <li>内装クリーニング・除菌</li>
      </ul>
      <p style="font-size: 13px; color: #86868b;">
        ご予約・ご相談は ${shop} までお気軽にお問い合わせください。
      </p>
    `,
  );
  return send(params.customerEmail, `[${shop}] 車検前メンテナンスのご案内`, html);
}
