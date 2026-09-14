import type { SupabaseClient } from "@supabase/supabase-js";

import type { ThreadRef } from "./threadKey";

/**
 * 会話受信箱のスレッド一覧 — 管理画面とモバイルで共有する取得ロジック。
 *
 * customer_messages を「スレッドキー」= customer_id > line_user_id > email_from の
 * 優先度でグルーピングし、各スレッドの最新メッセージ・未読 (inbound / read_at NULL)
 * 件数を返す。
 *
 * PostgREST に GROUP BY が無いので、直近メッセージを新しい順に取得して JS 側で
 * スレッドへ畳む (既存の集計パターンと同じ)。スキャン上限は MAX_SCAN。
 *
 * ponytail: 上限。MAX_SCAN 件を超える履歴を持つテナントでは古いスレッドが
 * 一覧から落ちる (truncated で通知する)。正すには集計ビューか RPC が要る。
 */

const MAX_SCAN = 1000;
const MAX_THREADS = 200;

type Row = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  email_from: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  body: string;
  read_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  created_at: string;
  ai_extracted: { intent?: string; handled_at?: string | null } | null;
};

export interface ThreadSummary {
  thread_key: string;
  customer_id: string | null;
  line_user_id: string | null;
  email_from: string | null;
  channel: string;
  last_body: string;
  last_direction: "inbound" | "outbound";
  last_created_at: string;
  unread_count: number;
  message_count: number;
  /** 予約系 intent の AI 抽出候補 (ai_extracted) が付いた未確認メッセージ数。 */
  candidate_count: number;
  customer_name: string | null;
}

export interface ThreadListResult {
  threads: ThreadSummary[];
  total_unread: number;
  scanned: number;
  truncated: boolean;
}

/** ai_extracted が予約系 (予約候補) かつ未対応かどうか。 */
function isReservationCandidate(ai: { intent?: string; handled_at?: string | null } | null): boolean {
  if (!ai || ai.handled_at) return false; // 対応済みはバッジに数えない
  return ai.intent === "new_reservation" || ai.intent === "change_reservation";
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * スレッドキーの決定。customer_id > line_user_id > email_from の順。
 * どれも無い行はスレッドに束ねられないので捨てる (null を返す)。
 */
export function threadKeyOf(r: {
  customer_id: string | null;
  line_user_id: string | null;
  email_from: string | null;
}): string | null {
  if (r.customer_id) return `c:${r.customer_id}`;
  if (r.line_user_id) return `l:${r.line_user_id}`;
  if (r.email_from) return `e:${r.email_from}`;
  return null;
}

/** 新しい順に並んだ行をスレッドへ畳む。純関数なので単体で検証できる。 */
export function foldThreads(rows: Row[]): Map<string, Omit<ThreadSummary, "customer_name">> {
  const threads = new Map<string, Omit<ThreadSummary, "customer_name">>();
  for (const r of rows) {
    const key = threadKeyOf(r);
    if (!key) continue;
    let t = threads.get(key);
    if (!t) {
      t = {
        thread_key: key,
        customer_id: r.customer_id,
        line_user_id: r.line_user_id,
        email_from: r.email_from,
        channel: r.channel,
        last_body: r.body,
        last_direction: r.direction,
        last_created_at: r.created_at,
        unread_count: 0,
        message_count: 0,
        candidate_count: 0,
      };
      threads.set(key, t);
    }
    t.message_count += 1;
    // customer_id が後から判明した行で thread のラベルを補完する。
    if (!t.customer_id && r.customer_id) t.customer_id = r.customer_id;
    if (!t.line_user_id && r.line_user_id) t.line_user_id = r.line_user_id;
    if (!t.email_from && r.email_from) t.email_from = r.email_from;
    if (r.direction === "inbound" && !r.read_at) t.unread_count += 1;
    if (r.direction === "inbound" && isReservationCandidate(r.ai_extracted)) t.candidate_count += 1;
  }
  return threads;
}

/**
 * スレッド一覧を取得する。
 *
 * @param admin tenant スコープ済みの service-role クライアント
 * @throws 取得に失敗した場合。呼び出し側で apiInternalError に変換すること
 */
export async function listMessageThreads(
  admin: SupabaseClient,
  tenantId: string,
  opts: { unreadOnly?: boolean } = {},
): Promise<ThreadListResult> {
  const BASE_COLS = "id, customer_id, line_user_id, channel, direction, body, delivered_at, failed_at, created_at";
  const colsFull = `${BASE_COLS}, email_from, read_at, ai_extracted`;
  const colsNoAi = `${BASE_COLS}, email_from, read_at`; // ai_extracted だけ未作成なら read_at/email_from は残す

  const scan = (cols: string) =>
    admin
      .from("customer_messages")
      .select(cols)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(MAX_SCAN);

  // read_at / ai_extracted 列が未作成 (マイグレーション未適用) でも段階的に縮退する。
  // 実在する列はできるだけ残すため、欠けている列だけを外して再取得する。
  let rows: Row[] = [];
  const sel = await scan(colsFull);
  if (!sel.error) {
    rows = (sel.data ?? []) as unknown as Row[];
  } else if (isMissingColumnError(sel.error)) {
    // まず ai_extracted だけ外す (read_at は維持して未読判定を壊さない)。
    const noAi = await scan(colsNoAi);
    if (!noAi.error) {
      rows = ((noAi.data ?? []) as unknown as Omit<Row, "ai_extracted">[]).map((r) => ({
        ...r,
        ai_extracted: null,
      }));
    } else if (isMissingColumnError(noAi.error)) {
      // read_at / email_from も無い更に古いスキーマ: まとめて外す。
      const bare = await scan(BASE_COLS);
      if (bare.error) throw bare.error;
      rows = ((bare.data ?? []) as unknown as Omit<Row, "read_at" | "ai_extracted" | "email_from">[]).map((r) => ({
        ...r,
        email_from: null,
        read_at: null,
        ai_extracted: null,
      }));
    } else {
      throw noAi.error;
    }
  } else {
    throw sel.error;
  }

  const list = Array.from(foldThreads(rows).values());

  // 顧客名を一括解決 (N+1 回避)。
  const customerIds = Array.from(new Set(list.map((t) => t.customer_id).filter((x): x is string => !!x)));
  const nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await admin
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", customerIds);
    for (const c of customers ?? []) nameById.set(c.id as string, (c.name as string) ?? "");
  }

  const enriched: ThreadSummary[] = list.map((t) => ({
    ...t,
    customer_name: t.customer_id ? (nameById.get(t.customer_id) ?? null) : null,
  }));

  const filtered = opts.unreadOnly ? enriched.filter((t) => t.unread_count > 0) : enriched;
  // 最新メッセージ降順 (既に rows が降順なので概ね順序維持されるが明示ソート)。
  filtered.sort((a, b) => new Date(b.last_created_at).getTime() - new Date(a.last_created_at).getTime());

  return {
    threads: filtered.slice(0, MAX_THREADS),
    total_unread: enriched.reduce((s, t) => s + t.unread_count, 0),
    scanned: rows.length,
    truncated: rows.length >= MAX_SCAN,
  };
}

// ─── 1 スレッド (会話) ────────────────────────────────────────────────

export const THREAD_MSG_COLS =
  "id, customer_id, line_user_id, channel, direction, body, sent_by, read_at, delivered_at, failed_at, failure_reason, line_message_id, line_timestamp_ms, created_at, attachment_path, attachment_content_type, ai_extracted";

export interface ResolvedThread {
  customerId: string | null;
  lineUserId: string | null;
  emailFrom: string | null;
  name: string | null;
}

/**
 * スレッド参照を解決し、表示名・送信先 lineUserId・customerId を確定する。
 * customer スレッドは customers から line_user_id / name を引く。
 * line スレッドは customers.line_user_id 一致を試み、見つかれば customer に昇格。
 */
export async function resolveThread(
  admin: SupabaseClient,
  tenantId: string,
  ref: Exclude<ThreadRef, { kind: "invalid" }>,
): Promise<ResolvedThread | null> {
  if (ref.kind === "customer") {
    const { data } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", ref.customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return null;
    return {
      customerId: data.id as string,
      lineUserId: (data.line_user_id as string | null) ?? null,
      emailFrom: null,
      name: (data.name as string | null) ?? null,
    };
  }
  // メールスレッド: 送信元アドレスで束ねた未紐付け行。表示名は送信元アドレス。
  if (ref.kind === "email") {
    return { customerId: null, lineUserId: null, emailFrom: ref.emailFrom, name: ref.emailFrom };
  }
  // line スレッド: 既に同 line_user_id の customer がいれば紐付けて扱う。
  const { data: matched } = await admin
    .from("customers")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("line_user_id", ref.lineUserId)
    .limit(1)
    .maybeSingle();
  if (matched) {
    return {
      customerId: matched.id as string,
      lineUserId: ref.lineUserId,
      emailFrom: null,
      name: (matched.name as string | null) ?? null,
    };
  }
  return { customerId: null, lineUserId: ref.lineUserId, emailFrom: null, name: null };
}

/** スレッドのメッセージを customer_id / line_user_id / email_from 各面で集める。 */
export async function fetchThreadMessages(
  admin: SupabaseClient,
  tenantId: string,
  customerId: string | null,
  lineUserId: string | null,
  emailFrom: string | null,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  if (customerId) {
    const { data } = await admin
      .from("customer_messages")
      .select(THREAD_MSG_COLS)
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .limit(500);
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  if (emailFrom) {
    // email_from 列が未作成の環境ではエラーを黙って空に (受信箱自体は動く)。
    const { data } = await admin
      .from("customer_messages")
      .select(THREAD_MSG_COLS)
      .eq("tenant_id", tenantId)
      .eq("email_from", emailFrom)
      .order("created_at", { ascending: true })
      .limit(500);
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  if (lineUserId) {
    // customer 未紐付けの同 line_user_id 行 (customer スレッドなら NULL のみ補完、
    // line スレッドなら全件)。
    let q = admin
      .from("customer_messages")
      .select(THREAD_MSG_COLS)
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (customerId) q = q.is("customer_id", null);
    const { data } = await q;
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  // id で重複排除し時系列ソート。
  const seen = new Set<string>();
  const dedup = out.filter((m) => {
    const id = m.id as string;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  dedup.sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());
  return dedup;
}

/**
 * スレッドの inbound 未読を一括既読化する。
 * read_at 列が無い環境ではノーオペにする (受信箱自体は動く)。
 *
 * @returns 既読にした件数
 * @throws read_at 欠落以外の DB エラー
 */
export async function markThreadRead(
  admin: SupabaseClient,
  tenantId: string,
  resolved: ResolvedThread,
): Promise<number> {
  const nowIso = new Date().toISOString();
  let updated = 0;

  const run = async (build: () => ReturnType<ReturnType<SupabaseClient["from"]>["update"]>) => {
    const { error, count } = await build();
    if (!error) updated += count ?? 0;
    else if (!isMissingColumnError(error)) throw error;
  };

  try {
    if (resolved.customerId) {
      await run(() =>
        admin
          .from("customer_messages")
          .update({ read_at: nowIso }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("customer_id", resolved.customerId!)
          .eq("direction", "inbound")
          .is("read_at", null),
      );
    }
    if (resolved.lineUserId) {
      await run(() => {
        let q = admin
          .from("customer_messages")
          .update({ read_at: nowIso }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("line_user_id", resolved.lineUserId!)
          .eq("direction", "inbound")
          .is("read_at", null);
        if (resolved.customerId) q = q.is("customer_id", null);
        return q;
      });
    }
    if (resolved.emailFrom) {
      await run(() =>
        admin
          .from("customer_messages")
          .update({ read_at: nowIso }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("email_from", resolved.emailFrom!)
          .eq("direction", "inbound")
          .is("read_at", null),
      );
    }
  } catch (e) {
    if (!isMissingColumnError(e as { code?: string; message?: string })) throw e;
  }

  return updated;
}
