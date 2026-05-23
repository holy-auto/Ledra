/**
 * 統一メール送信 adapter — Resend (primary) → SendGrid (fallback) の自動切替。
 *
 * G4 (OTP メール 全断対応) の中核。Resend が一過性 5xx / 429 / network error
 * で失敗した時に SendGrid に流す。両方失敗した場合のみ最終 failure を返す。
 *
 * 切替条件:
 * - Primary (Resend): `sendResendEmail` の独自 backoff (3 回まで) 内で完結
 *   できなかった transient 失敗 (status null = network、5xx、429)
 * - Permanent failure (4xx 非 429): 切替しない (Resend / SendGrid どちらでも
 *   結果は同じ。例: 無効アドレス、認証不正)
 *
 * SendGrid 未設定 (`SENDGRID_API_KEY` 未指定) の場合は Resend の結果を
 * そのまま返す。フォールバックを設定するかは運用判断 (本番では設定推奨)。
 *
 * 既存の `sendResendEmail` の利用箇所は段階的に `sendEmail` への移行を推奨。
 * 直接 Resend を呼ぶのは「Resend 固有の機能 (例: Resend Webhooks の
 * Idempotency-Key) を使いたい時」だけに限定する。
 */

import { logger } from "@/lib/logger";
import { sendResendEmail, type ResendMessage, type ResendSendResult } from "./resendSend";
import { sendSendGridEmail, isSendGridConfigured, type EmailSendResult, type SendGridMessage } from "./sendgrid";

export type UnifiedEmailMessage = ResendMessage;
export type UnifiedEmailResult = EmailSendResult & { provider: "resend" | "sendgrid" };

/**
 * Primary failure が SendGrid フォールバックを起動する条件か判定。
 * - status null (network エラー / circuit open) → transient なので fallback
 * - 5xx → transient
 * - 429 → transient (rate limited)
 * - 4xx (非 429) → permanent、両 ESP で結果が同じなので fallback しない
 */
function shouldFallback(primary: ResendSendResult): boolean {
  if (primary.ok) return false;
  if (primary.status == null) return true; // network / circuit open
  if (primary.status >= 500) return true;
  if (primary.status === 429) return true;
  return false; // 4xx permanent — fallback しても無駄
}

function toSendGridMessage(msg: UnifiedEmailMessage): SendGridMessage {
  return {
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    reply_to: msg.reply_to,
  };
}

/**
 * メール送信 (自動フォールバック付き)。
 *
 * 1. Resend に送信 (`sendResendEmail` の独自 backoff 込み)
 * 2. Resend が transient failure かつ SendGrid が設定済 → SendGrid に切替
 * 3. SendGrid も失敗 → 最終 failure (primary の理由を error に含める)
 */
export async function sendEmail(msg: UnifiedEmailMessage): Promise<UnifiedEmailResult> {
  const primary = await sendResendEmail(msg);
  if (primary.ok) {
    return { ok: true, id: primary.id, provider: "resend" };
  }

  if (!shouldFallback(primary)) {
    return { ...primary, provider: "resend" };
  }

  if (!isSendGridConfigured()) {
    logger.warn("sendEmail: resend failed but sendgrid not configured, no fallback", {
      status: primary.status,
      error: primary.error.slice(0, 200),
    });
    return { ...primary, provider: "resend" };
  }

  logger.warn("sendEmail: resend transient failure → falling back to sendgrid", {
    resendStatus: primary.status,
    resendError: primary.error.slice(0, 200),
  });

  const secondary = await sendSendGridEmail(toSendGridMessage(msg));
  if (secondary.ok) {
    return { ok: true, id: secondary.id, provider: "sendgrid" };
  }

  return {
    ok: false,
    status: secondary.status,
    error: `resend:${primary.error.slice(0, 200)} | sendgrid:${secondary.error.slice(0, 200)}`,
    provider: "sendgrid",
  };
}
