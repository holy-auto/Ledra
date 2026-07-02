/**
 * SendGrid REST API adapter (raw fetch + withRetry).
 *
 * Resend 全断時のフォールバック ESP として利用 (G4)。プライマリは Resend、
 * Resend が transient failure / circuit open になった時のみ呼ばれる。
 *
 * 戻り値は Resend と揃えて `EmailSendResult` 形式で返す。
 *
 * Env:
 *   SENDGRID_API_KEY  - SendGrid API key (sg_xxx)。未設定なら adapter は disabled
 *   SENDGRID_FROM     - 送信元アドレス (例: "noreply@ledra.co.jp")
 *
 * SDK を入れない理由:
 * - 必要な機能 (シンプル送信のみ) なら REST 直叩きで十分
 * - SDK は ~2MB の依存追加になり bundle に響く
 * - 将来 SendGrid 固有機能 (Dynamic Templates / Inbound Parse / etc.) を
 *   採用するなら SDK 導入を再評価
 */

import { withRetry } from "@/lib/http/withRetry";
import { logger } from "@/lib/logger";

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";
const SEND_TIMEOUT_MS = 15_000;

export type EmailSendSuccess = { ok: true; id: string | null };
export type EmailSendFailure = { ok: false; status: number | null; error: string };
export type EmailSendResult = EmailSendSuccess | EmailSendFailure;

export type SendGridMessage = {
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
};

function isConfigured(): boolean {
  return Boolean((process.env.SENDGRID_API_KEY ?? "").trim());
}

export { isConfigured as isSendGridConfigured };

function toRecipients(to: string | string[]): { email: string }[] {
  return (Array.isArray(to) ? to : [to]).map((email) => ({ email }));
}

/**
 * SendGrid に email を送る。Resend と同じ shape の結果を返す。
 *
 * - 5xx / 429 / network error → withRetry が自動 retry (最大 4 attempts)
 * - 4xx (permanent: 認証不正、無効アドレス等) → 即時 failure 返却
 * - 設定不備 (API key 未設定) → failure 返却 (caller はフォールバック先を持つ前提)
 */
export async function sendSendGridEmail(msg: SendGridMessage): Promise<EmailSendResult> {
  const apiKey = (process.env.SENDGRID_API_KEY ?? "").trim();
  const defaultFrom = (process.env.SENDGRID_FROM ?? process.env.RESEND_FROM ?? "").trim();
  const from = msg.from ?? defaultFrom;

  if (!apiKey) return { ok: false, status: null, error: "missing SENDGRID_API_KEY" };
  if (!from) return { ok: false, status: null, error: "missing SENDGRID_FROM" };

  const payload: Record<string, unknown> = {
    personalizations: [
      {
        to: toRecipients(msg.to),
        subject: msg.subject,
      },
    ],
    from: { email: from },
    // SendGrid v3 では reply_to / reply_to_list は message の top-level フィールド。
    ...(msg.reply_to ? { reply_to_list: toRecipients(msg.reply_to) } : {}),
    content: [
      ...(msg.text != null ? [{ type: "text/plain", value: msg.text }] : []),
      ...(msg.html != null ? [{ type: "text/html", value: msg.html }] : []),
    ],
  };

  if (Array.isArray(payload.content) && payload.content.length === 0) {
    return { ok: false, status: null, error: "missing email body (html or text required)" };
  }

  try {
    const res = await withRetry("sendgrid", async () => {
      const r = await fetch(SENDGRID_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (r.status >= 500 || r.status === 429) {
        const err = new Error(`sendgrid:${r.status}`) as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r;
    });

    if (res.ok) {
      // SendGrid v3: 202 Accepted + X-Message-Id header
      const id = res.headers.get("x-message-id");
      return { ok: true, id };
    }

    const bodyText = await res.text().catch(() => "");
    logger.warn("sendgrid permanent failure", { status: res.status, body: bodyText.slice(0, 200) });
    return { ok: false, status: res.status, error: bodyText.slice(0, 500) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("sendgrid send failed", { error: msg });
    return { ok: false, status: null, error: msg.slice(0, 500) };
  }
}
