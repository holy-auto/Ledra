import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { sendCustomerLineText } from "@/lib/line/client";
import { parseThreadKey, type ThreadRef } from "@/lib/messages/threadKey";
import { withAttachmentUrls } from "@/lib/messages/attachments";

export const dynamic = "force-dynamic";

/**
 * 受信箱の 1 スレッド (会話) の取得 / 返信送信。
 *
 * thread key は受信箱一覧 (`/api/admin/messages`) が返す形:
 *   - "c:<customerId>"  customer に紐付いたスレッド
 *   - "l:<lineUserId>"  まだ customer 未紐付け (友だち追加直後など)
 *
 * 顧客別タブ (`/api/admin/customers/[id]/messages`) と役割は同じだが、
 * line_user_id だけのスレッド (customer 未作成) もここで扱える点が異なる。
 */

const sendSchema = z.object({
  body: z.string().trim().min(1, "メッセージを入力してください。").max(2000, "メッセージは 2000 文字以内です。"),
});

const MSG_COLS =
  "id, customer_id, line_user_id, channel, direction, body, sent_by, read_at, delivered_at, failed_at, failure_reason, line_message_id, line_timestamp_ms, created_at, attachment_path, attachment_content_type";

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * スレッド参照を解決し、表示名・送信先 lineUserId・customerId を確定する。
 * customer スレッドは customers から line_user_id / name を引く。
 * line スレッドは customers.line_user_id 一致を試み、見つかれば customer に昇格。
 */
async function resolveThread(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  ref: Exclude<ThreadRef, { kind: "invalid" }>,
): Promise<{ customerId: string | null; lineUserId: string | null; name: string | null } | null> {
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
      name: (data.name as string | null) ?? null,
    };
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
      name: (matched.name as string | null) ?? null,
    };
  }
  return { customerId: null, lineUserId: ref.lineUserId, name: null };
}

/** スレッドのメッセージを customer_id / line_user_id 両面で集める。 */
async function fetchThreadMessages(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  customerId: string | null,
  lineUserId: string | null,
) {
  const out: Record<string, unknown>[] = [];
  if (customerId) {
    const { data } = await admin
      .from("customer_messages")
      .select(MSG_COLS)
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .limit(500);
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  if (lineUserId) {
    // customer 未紐付けの同 line_user_id 行 (customer スレッドなら NULL のみ補完、
    // line スレッドなら全件)。
    let q = admin
      .from("customer_messages")
      .select(MSG_COLS)
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const messages = await withAttachmentUrls(
      await fetchThreadMessages(admin, caller.tenantId, resolved.customerId, resolved.lineUserId),
    );

    return apiJson({
      thread: {
        key,
        customer_id: resolved.customerId,
        line_user_id: resolved.lineUserId,
        name: resolved.name,
      },
      messages,
      can_send: !!resolved.lineUserId,
    });
  } catch (e) {
    return apiInternalError(e, "message thread GET");
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = sendSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");
    if (!resolved.lineUserId) {
      return apiValidationError("このスレッドには LINE ユーザがまだ紐付いていません。");
    }

    const delivered = await sendCustomerLineText({
      tenantId: caller.tenantId,
      customerId: resolved.customerId,
      lineUserId: resolved.lineUserId,
      body: parsed.data.body,
      sentByUserId: caller.userId,
    });

    return apiJson({ ok: true, delivered });
  } catch (e) {
    return apiInternalError(e, "message thread POST");
  }
}

/**
 * PATCH /api/admin/messages/[key] — スレッドの inbound 未読を一括既読化する。
 * body 不要。スタッフがスレッドを開いた時点でクライアントから呼ぶ。
 */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind === "invalid") return apiValidationError("invalid thread key");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const resolved = await resolveThread(admin, caller.tenantId, ref);
    if (!resolved) return apiNotFound("thread not found");

    const nowIso = new Date().toISOString();
    let updated = 0;

    const markByCustomer = async () => {
      if (!resolved.customerId) return;
      const { error, count } = await admin
        .from("customer_messages")
        .update({ read_at: nowIso }, { count: "exact" })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", resolved.customerId)
        .eq("direction", "inbound")
        .is("read_at", null);
      if (!error) updated += count ?? 0;
      else if (!isMissingColumnError(error)) throw error;
    };
    const markByLineUser = async () => {
      if (!resolved.lineUserId) return;
      let q = admin
        .from("customer_messages")
        .update({ read_at: nowIso }, { count: "exact" })
        .eq("tenant_id", caller.tenantId)
        .eq("line_user_id", resolved.lineUserId)
        .eq("direction", "inbound")
        .is("read_at", null);
      if (resolved.customerId) q = q.is("customer_id", null);
      const { error, count } = await q;
      if (!error) updated += count ?? 0;
      else if (!isMissingColumnError(error)) throw error;
    };

    try {
      await markByCustomer();
      await markByLineUser();
    } catch (e) {
      // read_at 列が無い環境では既読化はノーオペにする (受信箱自体は動く)。
      if (!isMissingColumnError(e as { code?: string; message?: string })) {
        return apiInternalError(e, "message thread PATCH update");
      }
    }

    return apiJson({ ok: true, marked_read: updated });
  } catch (e) {
    return apiInternalError(e, "message thread PATCH");
  }
}
