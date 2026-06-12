/**
 * SMS 送信ユーティリティ (notification-broadcasts 用)。
 *
 * 実体は既存の Twilio クライアント (`src/lib/sms/client.ts`) に委譲する:
 *  - そちらは raw fetch + withRetry("twilio", ...) で一過性 5xx / 429 を回復し、
 *    E.164 整形も済ませている (audit:retry の対象も満たす)。
 *  - 本モジュールは多チャネル配信向けに `{ ok, error? }` の薄い shape へ揃える。
 *
 * 環境変数: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / 送信元番号。
 *  - 送信元は TWILIO_PHONE_NUMBER (既存) を優先し、TWILIO_FROM_NUMBER も許容する。
 *  - いずれか欠落時は警告ログを出して { ok: false, error: "SMS not configured" } を返す。
 */

import { logger } from "@/lib/logger";
import { sendNotificationSms, isSmsFailure } from "@/lib/sms/client";

export interface SmsResult {
  ok: boolean;
  error?: string;
}

/** Twilio に必要な env がすべて揃っているか (送信元は 2 つの命名を許容)。 */
function isConfigured(): boolean {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  return Boolean(sid && token && from);
}

/**
 * 1 件の SMS を送信する。
 *
 * @param to   宛先電話番号 (国内番号でも可。下層で E.164 整形される)
 * @param body 本文
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!isConfigured()) {
    logger.warn("[notifications.sms] SMS not configured (missing TWILIO_* env)");
    return { ok: false, error: "SMS not configured" };
  }
  const trimmed = body.trim();
  if (!to.trim() || !trimmed) {
    return { ok: false, error: "宛先と本文は必須です。" };
  }

  // 既存クライアントは送信元として TWILIO_PHONE_NUMBER を参照する。
  // 互換のため TWILIO_FROM_NUMBER しか無い環境では実行時に補完しておく。
  if (!process.env.TWILIO_PHONE_NUMBER && process.env.TWILIO_FROM_NUMBER) {
    process.env.TWILIO_PHONE_NUMBER = process.env.TWILIO_FROM_NUMBER;
  }

  const result = await sendNotificationSms(to.trim(), trimmed);
  if (isSmsFailure(result)) {
    return { ok: false, error: result.error || "SMS送信に失敗しました" };
  }
  return { ok: true };
}
