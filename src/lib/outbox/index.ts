/**
 * Outbox pattern helper.
 *
 * 使い方:
 *   await enqueueOutboxEvent(adminClient, {
 *     tenantId,
 *     topic: "agent.approved",
 *     aggregateId: agent.id,
 *     payload: { agent_id: agent.id, approved_by: caller.userId },
 *   });
 *
 * 同一の Postgrest 呼び出しの中で `agents.status = 'approved'` を update
 * したらすぐ enqueueOutboxEvent() で event を残す。両方が成功すれば
 * downstream への配送は cron (`/api/cron/outbox-flush`) に任せて良い。
 *
 * このモジュールは「書き込み」のみ。配送 worker は cron 側で実装する
 * (`processOutboxBatch()` をエクスポート)。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type OutboxStatus = "pending" | "in_flight" | "delivered" | "errored" | "dead_letter";

export interface EnqueueArgs {
  tenantId: string;
  topic: string;
  payload: Record<string, unknown>;
  aggregateId?: string | null;
  /** Defer first attempt by this many seconds. */
  delaySec?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function enqueueOutboxEvent(
  admin: Db,
  args: EnqueueArgs,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const nextAt = args.delaySec ? new Date(Date.now() + args.delaySec * 1000).toISOString() : new Date().toISOString();
  const { data, error } = await admin
    .from("outbox_events")
    .insert({
      tenant_id: args.tenantId,
      topic: args.topic,
      payload: args.payload,
      aggregate_id: args.aggregateId ?? null,
      next_attempt_at: nextAt,
    })
    .select("id")
    .single();
  if (error) {
    logger.error("outbox enqueue failed", { error, tenantId: args.tenantId, topic: args.topic });
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export interface OutboxRow {
  id: string;
  tenant_id: string;
  topic: string;
  payload: Record<string, unknown>;
  aggregate_id: string | null;
  attempts: number;
  status: OutboxStatus;
  next_attempt_at: string;
}

export type Dispatcher = (row: OutboxRow) => Promise<{ ok: true } | { ok: false; error: string }>;

export interface ProcessBatchOptions {
  /** Max events per invocation. Default 50. */
  batchSize?: number;
  /** Max attempts before moving to dead_letter. Default 8. */
  maxAttempts?: number;
}

/**
 * Drain a batch of `pending` events whose `next_attempt_at` is due.
 * Each event is dispatched via the per-topic dispatcher map.
 *
 * Backoff schedule (attempts → seconds): 30, 120, 600, 1800, 3600, 7200, 14400.
 */
export async function processOutboxBatch(
  admin: Db,
  dispatchers: Record<string, Dispatcher>,
  opts: ProcessBatchOptions = {},
): Promise<{ processed: number; delivered: number; errored: number; dead: number }> {
  const batchSize = opts.batchSize ?? 50;
  const maxAttempts = opts.maxAttempts ?? 8;

  // ponytail: worker クラッシュ等で in_flight のまま残った行を pending に戻す簡易リーパー。
  // TTL 15 分は「1 バッチの dispatch 所要時間より十分長い」決め打ち
  // （updated_at は claim 時に trigger で更新される）。upgrade path: claimed_at +
  // worker id での正確な lease 管理。
  await admin
    .from("outbox_events")
    .update({ status: "pending" })
    .eq("status", "in_flight")
    .lte("updated_at", new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString());

  const { data: rows, error } = await admin
    .from("outbox_events")
    .select("id, tenant_id, topic, payload, aggregate_id, attempts, status, next_attempt_at")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    logger.error("outbox: failed to fetch pending batch", { error });
    return { processed: 0, delivered: 0, errored: 0, dead: 0 };
  }

  let delivered = 0;
  let errored = 0;
  let dead = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    const dispatcher = dispatchers[row.topic];
    if (!dispatcher) {
      logger.warn("outbox: no dispatcher registered for topic", { topic: row.topic, id: row.id });
      continue;
    }

    // Mark in_flight to prevent double-processing if the worker overlaps.
    // 条件付き update が 0 行なら別 worker が先に claim 済みなのでスキップ。
    const { data: claimed } = await admin
      .from("outbox_events")
      .update({ status: "in_flight" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    // dispatcher の throw は {ok:false} と同じ扱いにして backoff / dead_letter に乗せる
    // （放置すると in_flight のまま固まり、バッチの残りも中断されるため）。
    let result: Awaited<ReturnType<Dispatcher>>;
    try {
      result = await dispatcher(row);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const nextAttempts = row.attempts + 1;

    if (result.ok) {
      await admin
        .from("outbox_events")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          attempts: nextAttempts,
          last_error: null,
        })
        .eq("id", row.id);
      delivered += 1;
    } else if (nextAttempts >= maxAttempts) {
      await admin
        .from("outbox_events")
        .update({
          status: "dead_letter",
          attempts: nextAttempts,
          last_error: result.error.slice(0, 1000),
        })
        .eq("id", row.id);
      dead += 1;
      logger.error("outbox: event moved to dead_letter", { id: row.id, topic: row.topic, attempts: nextAttempts });
    } else {
      const nextDelaySec = backoffSeconds(nextAttempts);
      await admin
        .from("outbox_events")
        .update({
          status: "pending",
          attempts: nextAttempts,
          last_error: result.error.slice(0, 1000),
          next_attempt_at: new Date(Date.now() + nextDelaySec * 1000).toISOString(),
        })
        .eq("id", row.id);
      errored += 1;
    }
  }

  return { processed: rows?.length ?? 0, delivered, errored, dead };
}

const STALE_IN_FLIGHT_MS = 15 * 60 * 1000;

const BACKOFF_TABLE = [30, 120, 600, 1800, 3600, 7200, 14400, 28800];

export function backoffSeconds(attempts: number): number {
  if (attempts <= 0) return BACKOFF_TABLE[0];
  if (attempts >= BACKOFF_TABLE.length) return BACKOFF_TABLE[BACKOFF_TABLE.length - 1];
  return BACKOFF_TABLE[attempts - 1];
}
