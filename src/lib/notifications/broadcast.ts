/**
 * 多チャネル一斉配信 (SMS / メール) の送信ヘルパ。
 *
 * LINE は既存の `sendLineBroadcast` (src/lib/line/broadcast.ts) を使うため、
 * 本モジュールは SMS (Twilio) / メール (Resend→SendGrid) の一斉送信を担う。
 *
 * 設計方針 (LINE broadcast と同じ流儀):
 *  - 失敗しても throw せず件数を集計して返す (販促一斉配信は一部失敗を許容)
 *  - 各送信は sms.ts / email.ts 経由 → 下層は withRetry で一過性 5xx/429 を回復
 *  - 同時実行数を CONCURRENCY に絞り、ESP / Twilio へのバーストを避ける
 *  - 配信結果は customer_messages に outbound として記録 (channel = sms/email)
 *    → 顧客 360° ビューのスレッドに履歴が残る
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { sendSms } from "./sms";
import { sendEmail } from "./email";

export interface NotificationRecipient {
  customerId: string | null;
  /** SMS チャネルの宛先電話番号 */
  phone?: string | null;
  /** email チャネルの宛先メールアドレス */
  email?: string | null;
}

export interface NotificationBroadcastResult {
  /** 配信を試みた対象数 */
  targetCount: number;
  /** 配信に成功した件数 */
  sentCount: number;
  /** 配信に失敗した件数 */
  failedCount: number;
  /** 当該チャネルが未設定 (env 欠落) のため 1 件も送れなかった場合 true */
  notConfigured: boolean;
}

/** 同時送信数。Twilio / ESP のレート制御 + メモリ保護のため小さく保つ。 */
const CONCURRENCY = 5;

/**
 * SMS / email チャネルへ同一本文を一斉送信する。
 *
 * @param channel "sms" | "email"
 * @param subject email チャネルの件名 (sms では無視)
 */
export async function sendNotificationBroadcast(params: {
  tenantId: string;
  channel: "sms" | "email";
  subject: string | null;
  body: string;
  recipients: NotificationRecipient[];
  sentByUserId?: string | null;
}): Promise<NotificationBroadcastResult> {
  const text = params.body.trim();
  const targetCount = params.recipients.length;

  if (!text || targetCount === 0) {
    return { targetCount, sentCount: 0, failedCount: 0, notConfigured: false };
  }

  // 先頭 1 件で設定の有無を判定する。未設定 (notConfigured) なら以降を打ち切る。
  let sentCount = 0;
  let failedCount = 0;
  let notConfigured = false;

  for (let i = 0; i < params.recipients.length; i += CONCURRENCY) {
    if (notConfigured) break;
    const chunk = params.recipients.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (recipient) => {
        const dest = params.channel === "sms" ? recipient.phone : recipient.email;
        if (!dest) {
          return { ok: false, notConfigured: false, dest: null as string | null };
        }
        try {
          const res =
            params.channel === "sms" ? await sendSms(dest, text) : await sendEmail(dest, params.subject ?? "", text);

          // env 未設定はチャネル全体の問題。打ち切りフラグを立てる。
          if (!res.ok && (res.error === "SMS not configured" || res.error === "Email not configured")) {
            return { ok: false, notConfigured: true, dest, reason: res.error };
          }
          await recordOutbound(params, recipient, dest, res.ok, res.ok ? null : (res.error ?? "send failed"));
          return { ok: res.ok, notConfigured: false, dest };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await recordOutbound(params, recipient, dest, false, reason);
          logger.warn("[notifications.broadcast] recipient send failed", {
            tenantId: params.tenantId,
            channel: params.channel,
            err: reason,
          });
          return { ok: false, notConfigured: false, dest };
        }
      }),
    );

    for (const r of results) {
      if (r.notConfigured) {
        notConfigured = true;
        break;
      }
      if (r.ok) sentCount += 1;
      else failedCount += 1;
    }
  }

  if (notConfigured) {
    return { targetCount, sentCount: 0, failedCount: 0, notConfigured: true };
  }

  return { targetCount, sentCount, failedCount, notConfigured: false };
}

/**
 * 送信結果を customer_messages に outbound として記録する (fail-soft)。
 * customer_id が無い宛先は記録しない (スレッドが成立しないため)。
 */
async function recordOutbound(
  params: { tenantId: string; channel: "sms" | "email"; subject: string | null; sentByUserId?: string | null },
  recipient: NotificationRecipient,
  dest: string,
  delivered: boolean,
  failureReason: string | null,
): Promise<void> {
  if (!recipient.customerId) return;
  try {
    const admin = createServiceRoleAdmin(
      "notification broadcast outbound logging — admin send lacks tenant-scoped RLS context",
    );
    const now = new Date().toISOString();
    // email は件名を本文先頭に含めてスレッド上で文脈が分かるようにする。
    const body = params.channel === "email" && params.subject ? `【${params.subject}】 ${dest}` : dest;
    await admin.from("customer_messages").insert({
      tenant_id: params.tenantId,
      customer_id: recipient.customerId,
      channel: params.channel,
      direction: "outbound",
      body,
      sent_by: params.sentByUserId ?? null,
      delivered_at: delivered ? now : null,
      failed_at: delivered ? null : now,
      failure_reason: delivered ? null : failureReason,
    });
  } catch (e) {
    logger.warn("[notifications.broadcast] recordOutbound threw", {
      tenantId: params.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
