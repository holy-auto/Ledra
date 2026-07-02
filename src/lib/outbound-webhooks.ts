/**
 * Outbound webhook 配信。outbox に enqueue → cron が deliverPendingWebhooks() を呼ぶ。
 *
 * 使い方 (発行側):
 *   await emitTenantEvent(admin, {
 *     tenantId,
 *     topic: "certificate.issued",
 *     aggregateId: cert.id,
 *     payload: { certificate_id: cert.id, public_id: cert.public_id, ... },
 *   });
 *
 * これだけで:
 *   1. outbox_events に topic='webhook' で row が積まれる
 *   2. cron が tenant_webhooks をルックアップし、subscribe している URL に
 *      HMAC 署名付きで POST する
 *   3. 失敗時は backoff + retry、8 回失敗で dead_letter
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueOutboxEvent, type Dispatcher } from "@/lib/outbox";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/http/withRetry";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, any, any>;

export interface EmitArgs {
  tenantId: string;
  topic: string;
  aggregateId?: string | null;
  payload: Record<string, unknown>;
}

/** Enqueue a webhook event. Idempotent per (tenant, topic, aggregateId, attempt). */
export async function emitTenantEvent(admin: AdminDb, args: EmitArgs) {
  return enqueueOutboxEvent(admin, {
    tenantId: args.tenantId,
    topic: "webhook",
    aggregateId: args.aggregateId ?? null,
    payload: {
      event_topic: args.topic,
      data: args.payload,
      // The outbox row's created_at is the canonical event timestamp.
    },
  });
}

/**
 * 単一エンティティの変更を webhook 通知する (手動編集・UI 経由の作成/更新など)。
 *
 * - tenant に有効な webhook 購読が無ければ何もしない (outbox を汚さない)。
 * - 自前で tenant-scoped admin を生成するため、呼び出し側は tenantId と
 *   ペイロードを渡すだけでよい (RLS user client から outbox に書けない問題を回避)。
 * - best-effort: 失敗しても呼び出し元の処理 (保存) は止めない。
 */
export async function emitEntityWebhook(
  tenantId: string,
  topic: string,
  aggregateId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { count } = await admin
      .from("tenant_webhooks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    if (!count) return;
    await emitTenantEvent(admin, { tenantId, topic, aggregateId, payload: data });
  } catch (e) {
    logger.warn("emitEntityWebhook failed", { error: e instanceof Error ? e.message : String(e), topic });
  }
}

/** HMAC-SHA256 over `${unix_ms}.${body}` with the per-webhook secret. */
export function signWebhook(secret: string, body: string, unixMs: number = Date.now()): string {
  const hmac = crypto.createHmac("sha256", secret).update(`${unixMs}.${body}`).digest("hex");
  return `t=${unixMs},v1=${hmac}`;
}

interface TenantWebhookRow {
  id: string;
  url: string;
  topics: string[];
  secret: string;
  is_active: boolean;
}

function topicMatches(subscribed: string[], eventTopic: string): boolean {
  if (subscribed.length === 0) return false;
  if (subscribed.includes("*")) return true;
  return subscribed.includes(eventTopic);
}

/**
 * Outbox dispatcher for `topic = 'webhook'`. Looks up matching tenant_webhooks
 * and delivers to each, returning a single Result for the outbox row.
 *
 * Semantics: the outbox row succeeds when **all** subscribed URLs accept it.
 * If any URL fails, the row is marked errored and retried — a re-attempt
 * will hit every subscriber again. Tenant-side webhook handlers MUST be
 * idempotent (the standard guidance for any webhook system).
 */
export function buildWebhookDispatcher(admin: AdminDb): Dispatcher {
  return async (row) => {
    const eventTopic = (row.payload as { event_topic?: string }).event_topic;
    if (!eventTopic || typeof eventTopic !== "string") {
      return { ok: false, error: "missing_event_topic" };
    }

    const { data: subs, error } = await admin
      .from("tenant_webhooks")
      .select("id, url, topics, secret, is_active")
      .eq("tenant_id", row.tenant_id)
      .eq("is_active", true);

    if (error) return { ok: false, error: `tenant_webhooks_lookup_failed:${error.message}` };

    const targets = ((subs ?? []) as TenantWebhookRow[]).filter((s) => topicMatches(s.topics, eventTopic));
    if (targets.length === 0) {
      // No subscriber for this event — treat as delivered (no-op).
      return { ok: true };
    }

    const body = JSON.stringify({
      id: row.id,
      tenant_id: row.tenant_id,
      topic: eventTopic,
      created_at: new Date().toISOString(),
      data: (row.payload as { data?: unknown }).data ?? {},
    });

    let firstError: string | null = null;

    for (const t of targets) {
      const sig = signWebhook(t.secret, body);
      try {
        await withRetry(`webhook:${t.id}`, async () => {
          const res = await fetch(t.url, {
            method: "POST",
            // SSRF guard 第二層: 登録時に検証済みのホストが 302 で内部アドレスへ
            // 飛ばすのを防ぐ。リダイレクトはエラー扱い → retry / dead_letter に乗る。
            redirect: "error",
            headers: {
              "content-type": "application/json",
              "x-ledra-signature": sig,
              "x-ledra-event-id": row.id,
              "x-ledra-event-topic": eventTopic,
            },
            body,
          });
          if (!res.ok) {
            const e = new Error(`status_${res.status}`) as Error & { status: number };
            e.status = res.status;
            throw e;
          }
          return res;
        });
        await admin
          .from("tenant_webhooks")
          .update({ last_delivery_at: new Date().toISOString(), last_delivery_status: "ok", last_delivery_error: null })
          .eq("id", t.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        firstError ||= `${t.url}: ${msg}`;
        await admin
          .from("tenant_webhooks")
          .update({
            last_delivery_at: new Date().toISOString(),
            last_delivery_status: "errored",
            last_delivery_error: msg.slice(0, 500),
          })
          .eq("id", t.id);
        logger.warn("webhook delivery failed", { url: t.url, error: msg });
      }
    }

    return firstError ? { ok: false, error: firstError } : { ok: true };
  };
}
