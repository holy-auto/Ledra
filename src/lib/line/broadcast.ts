/**
 * LINE 一斉配信 (Segmented Broadcast) の送信ヘルパ。
 *
 * 既存の getLineConfig / sendMessage を再利用しつつ、多数の受信者へ push する
 * ことに特化する:
 *  - LINE 設定はテナント単位で 1 回だけ解決 (受信者ごとに DB を引かない)
 *  - 各送信は withRetry("line", ...) で一過性 5xx / 429 / network error を回復
 *  - 配信結果は recordOutboundLineMessage で customer_messages に記録
 *  - 同時実行数を絞り (CONCURRENCY)、LINE API へのバーストを避ける
 *
 * 時効性より確実な記録を優先する用途 (販促一斉配信) を想定。重要 1:1 通知は
 * clientWithRetry.ts (SMS フォールバック付き) を使うこと。
 */

import { withRetry } from "@/lib/http/withRetry";
import { getLineConfig, sendMessage } from "./client";
import { recordOutboundLineMessage } from "./messageStore";
import { logger } from "@/lib/logger";

export interface BroadcastRecipient {
  lineUserId: string;
  customerId?: string | null;
}

export interface BroadcastResult {
  /** 配信を試みた対象数 (= recipients.length) */
  targetCount: number;
  /** 配信に成功した件数 */
  sentCount: number;
  /** 配信に失敗した件数 */
  failedCount: number;
  /** LINE 設定が未構成のため 1 件も送れなかった場合 true */
  notConfigured: boolean;
}

/** 同時送信数。LINE push のレート制御 + メモリ保護のため小さく保つ。 */
const CONCURRENCY = 5;

/**
 * 受信者リストへ同一テキストを一斉 push する。
 *
 * 失敗しても throw せず、件数を集計して返す (販促配信は一部失敗を許容)。
 * 各送信は customer_messages に outbound として記録される。
 */
export async function sendLineBroadcast(params: {
  tenantId: string;
  body: string;
  recipients: BroadcastRecipient[];
  sentByUserId?: string | null;
}): Promise<BroadcastResult> {
  const text = params.body.trim();
  const targetCount = params.recipients.length;

  if (!text || targetCount === 0) {
    return { targetCount, sentCount: 0, failedCount: 0, notConfigured: false };
  }

  const config = await getLineConfig(params.tenantId);
  if (!config) {
    return { targetCount, sentCount: 0, failedCount: 0, notConfigured: true };
  }

  let sentCount = 0;
  let failedCount = 0;

  // 同時実行数を CONCURRENCY に絞ってチャンク送信する。
  for (let i = 0; i < params.recipients.length; i += CONCURRENCY) {
    const chunk = params.recipients.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (recipient) => {
        try {
          await withRetry("line", () =>
            sendMessage(config.channelAccessToken, recipient.lineUserId, [{ type: "text", text }]),
          );
          await recordOutboundLineMessage({
            tenantId: params.tenantId,
            customerId: recipient.customerId ?? null,
            lineUserId: recipient.lineUserId,
            body: text,
            sentByUserId: params.sentByUserId ?? null,
            delivered: true,
          });
          return true;
        } catch (err) {
          await recordOutboundLineMessage({
            tenantId: params.tenantId,
            customerId: recipient.customerId ?? null,
            lineUserId: recipient.lineUserId,
            body: text,
            sentByUserId: params.sentByUserId ?? null,
            delivered: false,
            failureReason: err instanceof Error ? err.message : String(err),
          });
          logger.warn("[line.broadcast] recipient send failed", {
            tenantId: params.tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
          return false;
        }
      }),
    );
    for (const ok of results) {
      if (ok) sentCount += 1;
      else failedCount += 1;
    }
  }

  return { targetCount, sentCount, failedCount, notConfigured: false };
}
