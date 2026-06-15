/**
 * 供給パートナー (メーカー) への「新しい発注がポータルに届きました」通知。
 *
 * transport='portal' で発注を投函したときに呼ぶ。メールを主、LINE を従とする:
 *   - メール: 既存 sendEmail (Resend)。partner.contact_email 宛て。常に試行。
 *   - LINE : プラットフォーム共通 Ledra 公式チャネル (env) + partner.line_user_id が
 *            揃うときだけ best-effort 送信。未設定なら黙ってスキップ。
 *
 * いずれも fail-soft (throw しない)。投函処理本体を止めない。
 */
import { sendEmail } from "@/lib/email/sendEmail";
import { sendMessage } from "@/lib/line/client";
import { resolveBaseUrl } from "@/lib/url";
import { logger } from "@/lib/logger";

export interface PortalOrderNotifyTarget {
  partnerName: string | null;
  email: string | null;
  lineUserId: string | null;
}

export interface PortalOrderNotifyInfo {
  shopName: string;
  poNumber: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 新規ポータル発注をメーカーへ通知する。メール + (設定があれば) LINE。
 * 返り値は通知が 1 つでも送れたか (ログ/集計用)。失敗しても投げない。
 */
export async function notifyPartnerNewPortalOrder(
  target: PortalOrderNotifyTarget,
  info: PortalOrderNotifyInfo,
): Promise<boolean> {
  const portalUrl = `${resolveBaseUrl()}/agent/supply/orders`;
  const name = target.partnerName?.trim() || "ご担当者";
  let sent = false;

  // ── メール ──
  if (target.email) {
    try {
      const html = `
        <p>${escapeHtml(name)} 御中</p>
        <p>${escapeHtml(info.shopName)} より新しい発注が届きました（発注番号: <b>${escapeHtml(info.poNumber)}</b>）。</p>
        <p>受注ポータルで内容をご確認のうえ、受注・一部欠品・辞退をご回答ください。</p>
        <p><a href="${escapeHtml(portalUrl)}">受注ポータルを開く</a></p>
      `.trim();
      const res = await sendEmail({
        to: target.email,
        subject: `【新しい発注】${info.shopName} (${info.poNumber})`,
        html,
      });
      sent = sent || res.ok;
    } catch (e) {
      logger.warn("[portalNotify] email failed", { err: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── LINE (プラットフォーム共通チャネル / best-effort) ──
  const token = (process.env.LEDRA_PARTNER_LINE_CHANNEL_ACCESS_TOKEN ?? "").trim();
  if (token && target.lineUserId) {
    try {
      await sendMessage(token, target.lineUserId, [
        {
          type: "text",
          text: [
            `【新しい発注】${info.shopName}`,
            `発注番号: ${info.poNumber}`,
            ``,
            `受注ポータルでご確認ください:`,
            portalUrl,
          ].join("\n"),
        },
      ]);
      sent = true;
    } catch (e) {
      logger.warn("[portalNotify] LINE push failed", { err: e instanceof Error ? e.message : String(e) });
    }
  }

  return sent;
}
