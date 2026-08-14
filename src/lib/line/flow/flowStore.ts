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
  quote_doc_id: string | null;
  reservation_id: string | null;
}

type Admin = ReturnType<typeof createServiceRoleAdmin>;

/** 進行中 (終端でない) フローを 1 件返す。無ければ null。 */
export async function getActiveFlow(
  admin: Admin,
  tenantId: string,
  key: { customerId?: string | null; lineUserId?: string | null },
): Promise<ConversationFlowRow | null> {
  // 特殊文字を含む line_user_id は or フィルタ (下記) の構文を壊すため使わない。UUID の
  // customer_id は安全。LINE ユーザー ID は通常英数字のみ。
  const luid = key.lineUserId && !/[(),.]/.test(key.lineUserId) ? key.lineUserId : null;
  const cid = key.customerId ?? null;
  if (!cid && !luid) return null;
  try {
    // customer_id **または** line_user_id のいずれか一致で束ねる。全 LINE フローは
    // line_user_id を持つため、未紐付けで作った行 (customer_id=null) を後から紐付いた
    // customer_id で引いても取りこぼさない (逆も同様)。単一キー固定だと、紐付け前後で
    // キーが変わった瞬間に進行中フローを見失い、抑止や前進が効かなくなる。
    // expires_at 超過の停滞フローは「進行中」に数えない — 失効 cron が state を
    // 落とす前でも、期限切れフローが新規開始を永久に塞ぐのを防ぐ (時刻ベースで実効)。
    let q = admin
      .from("line_conversation_flows")
      .select("id, tenant_id, customer_id, line_user_id, state, context_json, quote_doc_id, reservation_id")
      .eq("tenant_id", tenantId)
      .not("state", "in", "(closed,expired)")
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false })
      .limit(1);
    if (cid && luid) q = q.or(`customer_id.eq.${cid},line_user_id.eq.${luid}`);
    else if (cid) q = q.eq("customer_id", cid);
    else q = q.eq("line_user_id", luid as string);
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
      .select("id, tenant_id, customer_id, line_user_id, state, context_json, quote_doc_id, reservation_id")
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
 * 予約に紐づくフローを全件返す (state を問わない)。予約を作った商談フロー自体も
 * `reservation_id` を持つため、呼び出し側は `context_json` の目印
 * (例: purpose マーカー) で目的のフローだけを絞り込むこと。取得失敗時は空配列。
 */
export async function getFlowsByReservationId(
  admin: Admin,
  tenantId: string,
  reservationId: string,
): Promise<ConversationFlowRow[]> {
  try {
    const { data, error } = await admin
      .from("line_conversation_flows")
      .select("id, tenant_id, customer_id, line_user_id, state, context_json, quote_doc_id, reservation_id")
      .eq("tenant_id", tenantId)
      .eq("reservation_id", reservationId);
    if (error) {
      logger.warn("[flowStore] getFlowsByReservationId failed", { tenantId, reservationId, err: error.message });
      return [];
    }
    return (data as ConversationFlowRow[] | null) ?? [];
  } catch (e) {
    logger.warn("[flowStore] getFlowsByReservationId threw", {
      tenantId,
      reservationId,
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * フローを次状態へ進める。state を更新し context をマージする (失敗しても投げない)。
 * 想定外の並行更新を避けるため、現在 state が期待どおりのときだけ更新する
 * (`expectState` 指定時)。更新できたら true。
 *
 * `.select("id")` で実際に更新できた行を取得し、0 件なら false を返す。これが無いと
 * PostgREST は WHERE 句 (expectState) が 0 行にしかマッチしなくても成功扱い (error=null)
 * を返すため、`expectState` による楽観ロックが機能しない (LINE の postback 再配信等で
 * 同じフローが二重処理されうる)。
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
    /** true のとき expires_at を今から FLOW_EXPIRY_HOURS 後へ更新する (失効窓を延長)。 */
    refreshExpiry?: boolean;
  },
): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = {
      state: input.toState,
      context_json: { ...(flow.context_json ?? {}), ...(input.contextPatch ?? {}) },
    };
    if (input.quoteDocId !== undefined) patch.quote_doc_id = input.quoteDocId;
    if (input.reservationId !== undefined) patch.reservation_id = input.reservationId;
    if (input.refreshExpiry) patch.expires_at = new Date(Date.now() + FLOW_EXPIRY_HOURS * 3600_000).toISOString();

    let q = admin.from("line_conversation_flows").update(patch).eq("id", flow.id);
    if (input.expectState) q = q.eq("state", input.expectState);
    const { data, error } = await q.select("id");
    if (error) {
      logger.warn("[flowStore] advanceFlow failed", { flowId: flow.id, err: error.message });
      return false;
    }
    if ((data?.length ?? 0) === 0) {
      logger.warn("[flowStore] advanceFlow: no row matched (stale state or concurrent update)", {
        flowId: flow.id,
        expectState: input.expectState,
      });
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
    reservationId?: string | null;
  },
): Promise<ConversationFlowRow | null> {
  try {
    const now = new Date();
    // 失効済み (expires_at 超過) の "進行中" 行を先に expired へ落とす。一意インデックスは
    // `state NOT IN ('closed','expired')` で張られており、他に失効スイープが無いため、放置
    // された行 (特に相談の human_takeover マーカー) が残ると同一キーの新規作成が一意制約で
    // 永久に失敗する。作成の直前に同一キーの失効行だけを掃除し、この rot を防ぐ。
    if (input.customerId || input.lineUserId) {
      let sweep = admin
        .from("line_conversation_flows")
        .update({ state: "expired" })
        .eq("tenant_id", input.tenantId)
        .lt("expires_at", now.toISOString())
        .not("state", "in", "(closed,expired)");
      sweep = input.customerId
        ? sweep.eq("customer_id", input.customerId)
        : sweep.eq("line_user_id", input.lineUserId as string);
      const { error: sweepErr } = await sweep;
      if (sweepErr) {
        logger.warn("[flowStore] createFlow stale sweep failed", { tenantId: input.tenantId, err: sweepErr.message });
      }
    }

    const expiresAt = new Date(now.getTime() + FLOW_EXPIRY_HOURS * 3600_000).toISOString();
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
        reservation_id: input.reservationId ?? null,
      })
      .select("id, tenant_id, customer_id, line_user_id, state, context_json, quote_doc_id, reservation_id")
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
