/**
 * SMS sending via Twilio API (raw fetch + withRetry).
 *
 * 設計方針:
 * - raw fetch + withRetry でラップ (SDK 不要、bundle size 節約)
 * - 用途別 wrapper を提供して呼び出し側の責務を明確化:
 *     - sendOtpSms       : OTP セカンダリ (G4 でメール ESP 全断時の最終手段)
 *     - sendNotificationSms : LINE 配信失敗時のフォールバック / 重要通知
 *     - sendManualSms    : admin の手動 SMS 送信 (SMS-only 顧客向け)
 *
 * 戻り値は typed result (`SmsSendResult`) で、Resend と同じ ok/false パターンに揃える。
 *
 * SDK 化のトリガー (将来):
 * - Twilio Verify API を OTP に採用する
 * - Twilio Lookup で電話番号正当性を事前検証する
 * - inbound SMS webhook の署名検証 (`validateRequest()`) が必要になる
 */

import { withRetry } from "@/lib/http/withRetry";
import { logger } from "@/lib/logger";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const SMS_TIMEOUT_MS = 10_000;

export type SmsSendSuccess = { ok: true; sid: string | null };
export type SmsSendFailure = { ok: false; status: number | null; error: string; errorCode: number | null };
export type SmsSendResult = SmsSendSuccess | SmsSendFailure;

export function isSmsFailure(r: SmsSendResult): r is SmsSendFailure {
  return r.ok === false;
}

interface TwilioConfig {
  sid: string;
  token: string;
  from: string;
}

function getConfig(): TwilioConfig | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

/** Format Japanese phone number to E.164 */
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) return "+81" + digits.slice(1);
  if (digits.startsWith("81")) return "+" + digits;
  return "+" + digits;
}

/**
 * 内部実装: Twilio Messages API への POST を withRetry で包む。
 * 5xx / 429 を throw して自動 retry、4xx は permanent として Response 透過。
 */
async function postTwilioMessage(cfg: TwilioConfig, to: string, body: string): Promise<SmsSendResult> {
  const formattedTo = formatPhoneE164(to);
  const url = `${TWILIO_API_BASE}/Accounts/${cfg.sid}/Messages.json`;
  const formBody = new URLSearchParams({ To: formattedTo, From: cfg.from, Body: body }).toString();

  try {
    const res = await withRetry("twilio", async () => {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
      });
      if (r.status >= 500 || r.status === 429) {
        const err = new Error(`twilio:${r.status}`) as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r;
    });

    if (res.ok) {
      let sid: string | null = null;
      try {
        const j = (await res.json()) as { sid?: string };
        sid = j.sid ?? null;
      } catch {
        // body parse 失敗は success 扱い (HTTP 200 = sent)
      }
      return { ok: true, sid };
    }

    // 4xx (permanent): Twilio error code を抽出
    let errorCode: number | null = null;
    let errorMessage = "";
    try {
      const j = (await res.json()) as { code?: number; message?: string };
      errorCode = j.code ?? null;
      errorMessage = j.message ?? "";
    } catch {
      errorMessage = await res.text().catch(() => "");
    }
    logger.warn("twilio permanent failure", { status: res.status, errorCode, errorMessage });
    return { ok: false, status: res.status, error: errorMessage.slice(0, 500), errorCode };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("twilio send failed", { error: msg });
    return { ok: false, status: null, error: msg.slice(0, 500), errorCode: null };
  }
}

/**
 * 汎用 SMS 送信 (後方互換)。boolean 戻りの旧 API を維持。
 * 新規実装では用途別 wrapper を使うこと。
 */
export async function sendSMS(to: string, body: string): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) return false;
  const result = await postTwilioMessage(cfg, to, body);
  return result.ok;
}

/**
 * OTP セカンダリ送信 (G4 メール ESP 全断時の最終フォールバック)。
 * Body は OTP コードを含む短文 (~100 字以内推奨)。
 */
export async function sendOtpSms(to: string, code: string, brand = "Ledra"): Promise<SmsSendResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, status: null, error: "twilio not configured", errorCode: null };
  const body = `[${brand}] 認証コード: ${code} (10 分以内に入力してください)`;
  return postTwilioMessage(cfg, to, body);
}

/**
 * 重要通知の SMS 送信 (G9 LINE 配信失敗時のフォールバック等)。
 * 作業完了 / 帳票リンク / 予約確認など、欠落が業務影響に直結する通知向け。
 */
export async function sendNotificationSms(to: string, message: string): Promise<SmsSendResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, status: null, error: "twilio not configured", errorCode: null };
  return postTwilioMessage(cfg, to, message);
}

/**
 * admin の手動 SMS 送信 (SMS-only 顧客向け、または LINE 未登録顧客への代替連絡)。
 * 呼び出し元で本文の妥当性 / 顧客同意を確認すること。
 */
export async function sendManualSms(to: string, message: string): Promise<SmsSendResult> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, status: null, error: "twilio not configured", errorCode: null };
  return postTwilioMessage(cfg, to, message);
}
