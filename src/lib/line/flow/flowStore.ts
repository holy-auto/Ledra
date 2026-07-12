/**
 * line_conversation_flows の永続化ヘルパ (service-role)。
 *
 * webhook / fire-and-forget の自動処理から呼ばれるため auth セッションが無い。
 * すべて fail-soft (失敗しても投げない)。テーブル未作成の環境でも既存挙動を
 * 壊さないよう、エラー時は「フロー無し」相当を返す。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { FlowState } from "./states";

/** 放置フローの失効までの時間 (設計: 72h)。 */
export const FLOW_EXPIRY_HOURS = 72;

export interface ConversationFlowRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  line_user_id: string | null;
  state: FlowState;
  context_json: Record<string, unknown>;
}

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** 進行中 (終端でない) フローを 1 件返す。無ければ null。 */
export async function getActiveFlow(
  admin: Admin,
  tenantId: string,
  key: { customerId?: string | null; lineUserId?: string | null },
): Promise<ConversationFlowRow | null> {
  if (!key.customerId && !key.lineUserId) return null;
  try {
    // customer_id を優先。未紐付けは line_user_id で束ねる。
    // expires_at 超過の停滞フローは「進行中」に数えない — 失効 cron が state を
    // 落とす前でも、期限切れフローが新規開始を永久に塞ぐのを防ぐ (時刻ベースで実効)。
    let q = admin
      .from("line_conversation_flows")
      .select("id, tenant_id, customer_id, line_user_id, state, context_json")
      .eq("tenant_id", tenantId)
      .not("state", "in", "(closed,expired)")
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false })
      .limit(1);
    q = key.customerId ? q.eq("customer_id", key.customerId) : q.eq("line_user_id", key.lineUserId as string);
    const { data, error } = await q.maybeSingle();
    if (error) {
      logger.warn("[flowStore] getActiveFlow failed", { tenantId, err: error.message });
      return null;
    }
    return (data as ConversationFlowRow | null) ?? null;
  } catch (e) {
    logger.warn("[flowStore] getActiveFlow threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** 進行中フローを見積書 doc_id で 1 件返す (スタッフ送付フック用)。無ければ null。 */
export async function getFlowByQuoteDoc(
  admin: Admin,
  tenantId: string,
  quoteDocId: string,
): Promise<ConversationFlowRow | null> {
  try {
    const { data, error } = await admin
      .from("line_conversation_flows")
      .select("id, tenant_id, customer_id, line_user_id, state, context_json")
      .eq("tenant_id", tenantId)
      .eq("quote_doc_id", quoteDocId)
      .not("state", "in", "(closed,expired)")
      .limit(1)
      .maybeSingle();
    if (error) {
      logger.warn("[flowStore] getFlowByQuoteDoc failed", { tenantId, err: error.message });
      return null;
    }
    return (data as ConversationFlowRow | null) ?? null;
  } catch (e) {
    logger.warn("[flowStore] getFlowByQuoteDoc threw", { tenantId, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * フローを次状態へ進める。state を更新し context をマージする (失敗しても投げない)。
 * 想定外の並行更新を避けるため、現在 state が期待どおりのときだけ更新する
 * (`expectState` 指定時)。更新できたら true。
 */
export async function advanceFlow(
  admin: Admin,
  flow: { id: string; context_json?: Record<string, unknown> },
  input: {
    toState: FlowState;
    contextPatch?: Record<string, unknown>;
    quoteDocId?: string | null;
    reservationId?: string | null;
    expectState?: FlowState;
  },
): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = {
      state: input.toState,
      context_json: { ...(flow.context_json ?? {}), ...(input.contextPatch ?? {}) },
    };
    if (input.quoteDocId !== undefined) patch.quote_doc_id = input.quoteDocId;
    if (input.reservationId !== undefined) patch.reservation_id = input.reservationId;

    let q = admin.from("line_conversation_flows").update(patch).eq("id", flow.id);
    if (input.expectState) q = q.eq("state", input.expectState);
    const { error } = await q;
    if (error) {
      logger.warn("[flowStore] advanceFlow failed", { flowId: flow.id, err: error.message });
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("[flowStore] advanceFlow threw", { flowId: flow.id, err: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** 新しいフローを作成する。作成できたら行を返す (失敗時 null)。 */
export async function createFlow(
  admin: Admin,
  input: {
    tenantId: string;
    customerId: string | null;
    lineUserId: string | null;
    state: FlowState;
    context?: Record<string, unknown>;
    lastMessageId?: string | null;
  },
): Promise<ConversationFlowRow | null> {
  try {
    const expiresAt = new Date(Date.now() + FLOW_EXPIRY_HOURS * 3600_000).toISOString();
    const { data, error } = await admin
      .from("line_conversation_flows")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        line_user_id: input.lineUserId,
        state: input.state,
        context_json: input.context ?? {},
        last_message_id: input.lastMessageId ?? null,
        expires_at: expiresAt,
      })
      .select("id, tenant_id, customer_id, line_user_id, state, context_json")
      .single();
    if (error) {
      // 一意制約違反 (既に進行中フローがある) は競合として無視。
      logger.warn("[flowStore] createFlow failed", { tenantId: input.tenantId, err: error.message });
      return null;
    }
    return data as ConversationFlowRow;
  } catch (e) {
    logger.warn("[flowStore] createFlow threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
