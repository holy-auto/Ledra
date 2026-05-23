/**
 * LINE 重要通知 (作業完了 / 帳票リンク / 予約確認) の信頼性ラッパ。
 *
 * 設計:
 * 1. `withRetry("line", ...)` で一過性 5xx / 429 / network error を自動回復
 * 2. 配信結果を必ず `recordOutboundLineMessage` で `customer_messages` に記録
 *    (delivered=true / failed=true をどちらも残し、UI で「未配信」表示可能に)
 * 3. retry 後も失敗かつ customer phone があれば Twilio SMS でフォールバック
 *    (G9 - LINE 未配信 → SMS の Yes 方針)
 *
 * 既存の sendBookingConfirmation / sendProgressUpdate / sendDocumentLink は
 * 無変更 (破壊的変更を回避)。重要通知の呼び出し元 (advance route 等) を
 * このモジュール経由に置換する。
 *
 * 時効性の高い通知 (sendBookingReminder, 進捗中の通知) は対象外 — 数分後の
 * 再配信は無価値なので fire-and-forget のままで OK。
 */

import { withRetry, CircuitOpenError } from "@/lib/http/withRetry";
import { getLineConfig, sendMessage } from "./client";
import { recordOutboundLineMessage } from "./messageStore";
import { sendNotificationSms } from "@/lib/sms/client";
import { logger } from "@/lib/logger";

export interface DeliveryResult {
  /** LINE 配信に最終的に成功したか */
  delivered: boolean;
  /** LINE 失敗時に SMS フォールバックを試したか / 成功したか */
  smsFallback?: "skipped" | "sent" | "failed";
  /** 失敗理由 (delivered=false 時のみ) */
  reason?: string;
}

interface BaseReliableArgs {
  tenantId: string;
  lineUserId: string;
  /** 配信記録 (customer_messages) のための customer 解決済 ID。なくても記録は可能 */
  customerId?: string | null;
  /** SMS フォールバック用の E.164 電話番号。未設定なら SMS は試行しない */
  customerPhone?: string | null;
  /** 配信記録に保存する平文 body (LINE Flex 等の場合も人間可読のサマリを入れる) */
  bodyForRecord: string;
  /** SMS フォールバック時に送る短縮文 (省略時は bodyForRecord を使用) */
  smsBodyOverride?: string;
  /** 送信者 user_id (管理画面からの送信の場合) */
  sentByUserId?: string | null;
}

type LineMessage = Parameters<typeof sendMessage>[2][number];

async function sendReliable(args: BaseReliableArgs, messages: LineMessage[]): Promise<DeliveryResult> {
  const config = await getLineConfig(args.tenantId);
  if (!config) {
    // tenant が LINE 未設定 → SMS フォールバックは有効性のあるパス
    if (args.customerPhone) {
      const sms = await sendNotificationSms(args.customerPhone, args.smsBodyOverride ?? args.bodyForRecord);
      return {
        delivered: false,
        reason: "no_line_config",
        smsFallback: sms.ok ? "sent" : "failed",
      };
    }
    return { delivered: false, reason: "no_line_config", smsFallback: "skipped" };
  }

  try {
    await withRetry("line", () => sendMessage(config.channelAccessToken, args.lineUserId, messages));
    await recordOutboundLineMessage({
      tenantId: args.tenantId,
      lineUserId: args.lineUserId,
      customerId: args.customerId ?? null,
      sentByUserId: args.sentByUserId ?? null,
      body: args.bodyForRecord,
      delivered: true,
    });
    return { delivered: true };
  } catch (err) {
    const reason = err instanceof CircuitOpenError ? "circuit_open" : err instanceof Error ? err.message : String(err);
    logger.warn("[lineWithRetry] delivery failed", {
      tenantId: args.tenantId,
      lineUserId: args.lineUserId.slice(0, 8) + "…",
      reason: reason.slice(0, 200),
    });

    await recordOutboundLineMessage({
      tenantId: args.tenantId,
      lineUserId: args.lineUserId,
      customerId: args.customerId ?? null,
      sentByUserId: args.sentByUserId ?? null,
      body: args.bodyForRecord,
      delivered: false,
      failureReason: reason.slice(0, 500),
    });

    if (!args.customerPhone) {
      return { delivered: false, reason, smsFallback: "skipped" };
    }

    const sms = await sendNotificationSms(args.customerPhone, args.smsBodyOverride ?? args.bodyForRecord);
    return {
      delivered: false,
      reason,
      smsFallback: sms.ok ? "sent" : "failed",
    };
  }
}

/**
 * 予約確認 (申込直後)。
 * 失敗時は SMS フォールバック + customer_messages に未配信レコード。
 */
export async function sendBookingConfirmationReliable(
  base: BaseReliableArgs,
  booking: {
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    tenant_name: string;
  },
): Promise<DeliveryResult> {
  const text = [
    `【予約確認】${booking.tenant_name}`,
    ``,
    `📅 ${booking.scheduled_date}`,
    `🕐 ${booking.start_time} 〜 ${booking.end_time}`,
    `📝 ${booking.title}`,
    ``,
    `ご予約ありがとうございます。`,
    `キャンセル・変更はお店に直接ご連絡ください。`,
  ].join("\n");

  return sendReliable(
    {
      ...base,
      bodyForRecord: text,
      smsBodyOverride: `[${booking.tenant_name}] 予約確認: ${booking.scheduled_date} ${booking.start_time}〜 ${booking.title}`,
    },
    [{ type: "text", text }],
  );
}

/**
 * 施工完了通知 (作業完了 = progressPct >= 100 のとき呼ぶこと)。
 * 進捗中の通知 (progressPct < 100) は時効性が高いので、従来の
 * sendProgressUpdate (fire-and-forget) を使い続ける方針。
 */
export async function sendProgressCompletionReliable(
  base: BaseReliableArgs,
  params: {
    customerName: string;
    tenantName: string;
    stepLabel: string;
    portalUrl: string;
  },
): Promise<DeliveryResult> {
  const text = [
    `【施工完了】${params.tenantName}`,
    ``,
    `${params.customerName} 様`,
    ``,
    `✅ ${params.stepLabel} が完了しました。`,
    `お引き取りをお待ちしております。`,
    ``,
    params.portalUrl,
  ].join("\n");

  return sendReliable(
    {
      ...base,
      bodyForRecord: text,
      smsBodyOverride: `[${params.tenantName}] 施工が完了しました。詳細: ${params.portalUrl}`,
    },
    [{ type: "text", text }],
  );
}

/**
 * 帳票リンク送信 (請求書・証明書 URL 等)。顧客アクション要求 = 失敗許容できない。
 */
export async function sendDocumentLinkReliable(
  base: BaseReliableArgs,
  params: {
    docType: string;
    docNumber: string;
    totalAmount: number;
    message?: string;
    documentUrl?: string;
  },
): Promise<DeliveryResult> {
  const text = [
    `【${params.docType}】${params.docNumber}`,
    `金額: ¥${params.totalAmount.toLocaleString("ja-JP")}`,
    params.message ?? null,
    params.documentUrl ?? null,
  ]
    .filter(Boolean)
    .join("\n");

  return sendReliable(
    {
      ...base,
      bodyForRecord: text,
      smsBodyOverride: `[${params.docType}] ${params.docNumber} ¥${params.totalAmount.toLocaleString("ja-JP")}${params.documentUrl ? ` ${params.documentUrl}` : ""}`,
    },
    [{ type: "text", text }],
  );
}
