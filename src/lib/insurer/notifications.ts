/**
 * 保険会社ポータル通知メール送信ユーティリティ
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
        CARTRUST — 株式会社HOLY AUTO
      </div>
    </div>
  `;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!apiKey || !from) {
    console.warn("[insurer-notification] skipped — missing RESEND_API_KEY or RESEND_FROM");
    return false;
  }
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: "support@cartrust.co.jp", subject, html }),
    });
    if (!res.ok) {
      const resBody = await res.text().catch(() => "");
      console.error("[insurer-notification] email error:", res.status, resBody);
    }
    return res.ok;
  } catch (e) {
    console.error("[insurer-notification] email failed:", e);
    return false;
  }
}

/** 案件ステータス更新通知 — 保険会社宛て */
export async function sendCaseStatusNotification(params: {
  recipientEmail: string;
  recipientName: string;
  caseNumber: string;
  caseTitle: string;
  oldStatus: string;
  newStatus: string;
  updatedBy: string;
}): Promise<boolean> {
  const name = escapeHtml(params.recipientName);
  const title = escapeHtml(params.caseTitle);
  const num = escapeHtml(params.caseNumber);
  const from = escapeHtml(statusLabel(params.oldStatus));
  const to = escapeHtml(statusLabel(params.newStatus));
  const updatedBy = escapeHtml(params.updatedBy);

  const html = wrap(
    "案件ステータスが更新されました",
    `
      <p style="color: #1d1d1f; font-size: 14px; line-height: 1.6;">
        ${name} 様<br><br>
        以下の案件のステータスが更新されました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        案件番号: <strong>${num}</strong><br>
        タイトル: <strong>${title}</strong><br>
        ステータス: ${from} → <strong>${to}</strong><br>
        更新者: ${updatedBy}
      </div>
      <p style="font-size: 13px; color: #86868b;">
        詳細はCARTRUST保険会社ポータルよりご確認ください。
      </p>
    `,
  );

  return send(
    params.recipientEmail,
    `【CARTRUST】案件 ${params.caseNumber} のステータスが更新されました`,
    html,
  );
}

/** 案件新規メッセージ通知 — 保険会社 / テナント宛て */
export async function sendCaseMessageNotification(params: {
  recipientEmail: string;
  recipientName: string;
  caseNumber: string;
  caseTitle: string;
  senderName: string;
  messagePreview: string;
}): Promise<boolean> {
  const name = escapeHtml(params.recipientName);
  const title = escapeHtml(params.caseTitle);
  const num = escapeHtml(params.caseNumber);
  const sender = escapeHtml(params.senderName);
  const preview = escapeHtml(
    params.messagePreview.length > 200
      ? params.messagePreview.slice(0, 200) + "..."
      : params.messagePreview,
  );

  const html = wrap(
    "案件に新しいメッセージがあります",
    `
      <p style="color: #1d1d1f; font-size: 14px; line-height: 1.6;">
        ${name} 様<br><br>
        以下の案件に新しいメッセージが投稿されました。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        案件番号: <strong>${num}</strong><br>
        タイトル: <strong>${title}</strong><br>
        送信者: ${sender}
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 13px; color: #1d1d1f; font-style: italic;">
        "${preview}"
      </div>
      <p style="font-size: 13px; color: #86868b;">
        詳細はCARTRUSTポータルよりご確認ください。
      </p>
    `,
  );

  return send(
    params.recipientEmail,
    `【CARTRUST】案件 ${params.caseNumber} に新しいメッセージ`,
    html,
  );
}

/** 案件作成通知 — テナント宛て */
export async function sendCaseCreatedNotification(params: {
  recipientEmail: string;
  recipientName: string;
  caseNumber: string;
  caseTitle: string;
  insurerName: string;
  priority: string;
}): Promise<boolean> {
  const name = escapeHtml(params.recipientName);
  const title = escapeHtml(params.caseTitle);
  const num = escapeHtml(params.caseNumber);
  const insurer = escapeHtml(params.insurerName);
  const pri = escapeHtml(priorityLabel(params.priority));

  const html = wrap(
    "保険会社から新規案件が作成されました",
    `
      <p style="color: #1d1d1f; font-size: 14px; line-height: 1.6;">
        ${name} 様<br><br>
        ${insurer} より新規案件が作成されました。ご確認ください。
      </p>
      <div style="background: #f5f5f7; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; color: #1d1d1f;">
        案件番号: <strong>${num}</strong><br>
        タイトル: <strong>${title}</strong><br>
        優先度: <strong>${pri}</strong>
      </div>
      <p style="font-size: 13px; color: #86868b;">
        詳細はCARTRUST管理画面よりご確認ください。
      </p>
    `,
  );

  return send(
    params.recipientEmail,
    `【CARTRUST】${insurer} から新規案件: ${params.caseNumber}`,
    html,
  );
}

/* ── label helpers ── */

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: "対応待ち",
    in_progress: "対応中",
    pending_tenant: "施工店確認中",
    resolved: "解決済み",
    closed: "クローズ",
  };
  return map[status] ?? status;
}

function priorityLabel(priority: string): string {
  const map: Record<string, string> = {
    low: "低",
    normal: "通常",
    high: "高",
    urgent: "緊急",
  };
  return map[priority] ?? priority;
}
