import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/messages
 *
 * 横断的な会話受信箱のスレッド一覧。
 * customer_messages を「スレッドキー」= customer_id があればそれ、無ければ
 * line_user_id でグルーピングし、各スレッドの最新メッセージ・未読 (inbound /
 * read_at NULL) 件数を返す。
 *
 * PostgREST に GROUP BY が無いので、直近メッセージを新しい順に取得して JS 側で
 * スレッドへ畳む (既存の集計パターンと同じ)。スキャン上限は MAX_SCAN。
 */

const MAX_SCAN = 1000;
const MAX_THREADS = 200;

type Row = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  body: string;
  read_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  created_at: string;
  ai_extracted: { intent?: string } | null;
};

interface ThreadAccum {
  thread_key: string;
  customer_id: string | null;
  line_user_id: string | null;
  channel: string;
  last_body: string;
  last_direction: "inbound" | "outbound";
  last_created_at: string;
  unread_count: number;
  message_count: number;
  /** 予約系 intent の AI 抽出候補 (ai_extracted) が付いた未確認メッセージ数。 */
  candidate_count: number;
}

/** ai_extracted が予約系 (予約候補) かどうか。 */
function isReservationCandidate(ai: { intent?: string } | null): boolean {
  const intent = ai?.intent;
  return intent === "new_reservation" || intent === "change_reservation";
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const cols =
      "id, customer_id, line_user_id, channel, direction, body, read_at, delivered_at, failed_at, created_at, ai_extracted";
    // read_at / ai_extracted 列が未作成 (マイグレーション未適用) なら外して取得する。
    let rows: Row[] = [];
    {
      const sel = await admin
        .from("customer_messages")
        .select(cols)
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false })
        .limit(MAX_SCAN);
      if (sel.error && isMissingColumnError(sel.error)) {
        const retry = await admin
          .from("customer_messages")
          .select("id, customer_id, line_user_id, channel, direction, body, delivered_at, failed_at, created_at")
          .eq("tenant_id", caller.tenantId)
          .order("created_at", { ascending: false })
          .limit(MAX_SCAN);
        if (retry.error) return apiInternalError(retry.error, "messages list (fallback)");
        rows = ((retry.data ?? []) as Omit<Row, "read_at" | "ai_extracted">[]).map((r) => ({
          ...r,
          read_at: null,
          ai_extracted: null,
        }));
      } else if (sel.error) {
        return apiInternalError(sel.error, "messages list");
      } else {
        rows = (sel.data ?? []) as Row[];
      }
    }

    // スレッドへ畳む (rows は created_at 降順なので、各スレッド最初に見たものが最新)。
    const threads = new Map<string, ThreadAccum>();
    for (const r of rows) {
      const key = r.customer_id ? `c:${r.customer_id}` : r.line_user_id ? `l:${r.line_user_id}` : null;
      if (!key) continue;
      let t = threads.get(key);
      if (!t) {
        t = {
          thread_key: key,
          customer_id: r.customer_id,
          line_user_id: r.line_user_id,
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
      if (r.direction === "inbound" && !r.read_at) t.unread_count += 1;
      if (r.direction === "inbound" && isReservationCandidate(r.ai_extracted)) t.candidate_count += 1;
    }

    let list = Array.from(threads.values());

    // 顧客名を一括解決 (N+1 回避)。
    const customerIds = Array.from(new Set(list.map((t) => t.customer_id).filter((x): x is string => !!x)));
    const nameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name")
        .eq("tenant_id", caller.tenantId)
        .in("id", customerIds);
      for (const c of customers ?? []) nameById.set(c.id as string, (c.name as string) ?? "");
    }

    const enriched = list.map((t) => ({
      ...t,
      customer_name: t.customer_id ? (nameById.get(t.customer_id) ?? null) : null,
    }));

    const filtered = unreadOnly ? enriched.filter((t) => t.unread_count > 0) : enriched;
    // 最新メッセージ降順 (既に rows が降順なので概ね順序維持されるが明示ソート)。
    filtered.sort((a, b) => new Date(b.last_created_at).getTime() - new Date(a.last_created_at).getTime());

    const total_unread = enriched.reduce((s, t) => s + t.unread_count, 0);

    return apiJson({
      threads: filtered.slice(0, MAX_THREADS),
      total_unread,
      scanned: rows.length,
      truncated: rows.length >= MAX_SCAN,
    });
  } catch (e) {
    return apiInternalError(e, "messages list");
  }
}
