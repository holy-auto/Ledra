import { createServiceRoleAdmin, createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * customer_messages 表に対する永続化ヘルパ。
 *
 * LINE Webhook (inbound) と管理画面の Push 送信 (outbound) の両方で使う。
 * customer_id が分からない場合 (LINE 友だち追加直後など) は line_user_id だけ
 * で挿入する。後から customers.line_user_id でリンクできる。
 */

export interface InboundLineMessage {
  tenantId: string;
  lineUserId: string;
  body: string;
  rawEvent?: unknown;
  lineMessageId?: string | null;
  lineTimestampMs?: number | null;
  /** line-media バケット内の添付保存パス (画像受信時) */
  attachmentPath?: string | null;
  attachmentContentType?: string | null;
}

export interface OutboundLineMessage {
  tenantId: string;
  lineUserId: string;
  body: string;
  customerId?: string | null;
  sentByUserId?: string | null;
  lineMessageId?: string | null;
  /** false の場合 failed_at を埋めて failure_reason を保持する */
  delivered?: boolean;
  failureReason?: string | null;
  /** line-media バケット内の添付保存パス (画像送信時) */
  attachmentPath?: string | null;
  attachmentContentType?: string | null;
}

/**
 * 顧客テーブルから line_user_id でマッチする顧客を 1 件返す。
 * inbound メッセージ受信時にスレッドを正しい customer に紐付けるために使う。
 */
async function resolveCustomerIdByLineUser(tenantId: string, lineUserId: string): Promise<string | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch (e) {
    logger.warn("[messageStore] resolveCustomerIdByLineUser failed", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * LINE Webhook で受信した顧客発メッセージを customer_messages に書き込む。
 * customer は line_user_id でマッチを試み、見つからなければ NULL のまま保存。
 *
 * 失敗時は呼び出し元 (webhook) を止めない (LINE は 200 を即返す必要がある)。
 */
export async function recordInboundLineMessage(
  input: InboundLineMessage,
): Promise<{ ok: boolean; id?: string; customerId?: string | null }> {
  try {
    const customerId = await resolveCustomerIdByLineUser(input.tenantId, input.lineUserId);

    // RLS をバイパスして書き込むため service-role を使う (Webhook / 自動送信には
    // auth セッションが無いため tenant-scoped クライアントが使えない)。tenant_id
    // は webhook クエリパラメータ or 呼び出し元から厳密に渡される値を使うため、
    // 他テナントへの混入は customer_messages_select_v2 の RLS で防がれる。
    const admin = createServiceRoleAdmin(
      "LINE inbound/outbound message logging — webhook & admin push lack auth session",
    );
    const { data, error } = await admin
      .from("customer_messages")
      .insert({
        tenant_id: input.tenantId,
        customer_id: customerId,
        line_user_id: input.lineUserId,
        channel: "line",
        direction: "inbound",
        body: input.body,
        raw_event: input.rawEvent ?? null,
        line_message_id: input.lineMessageId ?? null,
        line_timestamp_ms: input.lineTimestampMs ?? null,
        attachment_path: input.attachmentPath ?? null,
        attachment_content_type: input.attachmentContentType ?? null,
      })
      .select("id")
      .single();
    if (error) {
      logger.warn("[messageStore] inbound insert failed", { tenantId: input.tenantId, err: error.message });
      return { ok: false, customerId };
    }
    return { ok: true, id: data?.id as string | undefined, customerId };
  } catch (e) {
    logger.warn("[messageStore] recordInboundLineMessage threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

/**
 * 店舗 → 顧客の Push 送信ログを customer_messages に書き込む。
 *
 * 配信成功時は `delivered=true` を、失敗時は `delivered=false` + `failureReason`
 * を渡す。どちらの場合もテーブルには行を残し、UI 上で「未配信」表示できるよう
 * にする (LINE の即時 push が失敗しても履歴は消さない方針)。
 */
export async function recordOutboundLineMessage(input: OutboundLineMessage): Promise<{ ok: boolean; id?: string }> {
  try {
    const admin = createServiceRoleAdmin("LINE outbound message logging — admin push lacks tenant-scoped RLS context");
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("customer_messages")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId ?? null,
        line_user_id: input.lineUserId,
        channel: "line",
        direction: "outbound",
        body: input.body,
        sent_by: input.sentByUserId ?? null,
        line_message_id: input.lineMessageId ?? null,
        attachment_path: input.attachmentPath ?? null,
        attachment_content_type: input.attachmentContentType ?? null,
        delivered_at: input.delivered === false ? null : now,
        failed_at: input.delivered === false ? now : null,
        failure_reason: input.delivered === false ? (input.failureReason ?? null) : null,
      })
      .select("id")
      .single();
    if (error) {
      logger.warn("[messageStore] outbound insert failed", { tenantId: input.tenantId, err: error.message });
      return { ok: false };
    }
    return { ok: true, id: data?.id as string | undefined };
  } catch (e) {
    logger.warn("[messageStore] recordOutboundLineMessage threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}
