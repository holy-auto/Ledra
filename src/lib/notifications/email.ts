/**
 * メール送信ユーティリティ (notification-broadcasts 用)。
 *
 * 実体は既存の統一メール adapter (`src/lib/email/sendEmail.ts`) に委譲する:
 *  - そちらは Resend (primary) → SendGrid (fallback) を自動切替し、
 *    各 ESP の呼び出しは withRetry で包まれている (audit:retry を満たす)。
 *  - 本モジュールは多チャネル配信向けに `{ ok, error? }` の薄い shape へ揃える。
 *
 * 送信元アドレスの解決順:
 *   NOTIFICATION_FROM_EMAIL → RESEND_FROM_EMAIL → RESEND_FROM → SENDGRID_FROM
 *   → "noreply@example.com"
 *
 * いずれの ESP も未設定 (RESEND_API_KEY も SENDGRID_API_KEY も無い) の場合は
 * 警告ログを出して { ok: false, error: "Email not configured" } を返す。
 */

import { logger } from "@/lib/logger";
import { sendEmail as sendUnifiedEmail } from "@/lib/email/sendEmail";
import { isSendGridConfigured } from "@/lib/email/sendgrid";

export interface EmailResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_FROM = "noreply@example.com";

/** 送信元アドレスを env から解決する。 */
function resolveFrom(): string {
  return (
    process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    process.env.SENDGRID_FROM?.trim() ||
    DEFAULT_FROM
  );
}

/** いずれかの ESP が利用可能か。 */
function isConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim()) || isSendGridConfigured();
}

/**
 * 1 件のメールを送信する (プレーンテキスト)。
 *
 * @param to      宛先メールアドレス
 * @param subject 件名
 * @param text    本文 (プレーンテキスト)
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  if (!isConfigured()) {
    logger.warn("[notifications.email] Email not configured (no RESEND_API_KEY / SENDGRID_API_KEY)");
    return { ok: false, error: "Email not configured" };
  }
  if (!to.trim() || !subject.trim() || !text.trim()) {
    return { ok: false, error: "宛先・件名・本文は必須です。" };
  }

  const result = await sendUnifiedEmail({
    from: resolveFrom(),
    to: to.trim(),
    subject: subject.trim(),
    text,
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "メール送信に失敗しました" };
  }
  return { ok: true };
}
