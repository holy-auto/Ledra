import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  notificationBroadcastCreateSchema,
  notificationBroadcastUpdateSchema,
  NOTIFICATION_BROADCAST_STATUSES,
  NOTIFICATION_CHANNELS,
  type NotificationBroadcastStatus,
  type NotificationChannel,
} from "@/lib/validations/notification-broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLUMNS = `
  id, name, channel, subject, message_text, segment_json, status, scheduled_at, sent_at,
  target_count, sent_count, failed_count, created_by, created_at, updated_at
`;

/**
 * 許可するステータス遷移 (PATCH)。それ以外への変更は拒否する。
 *  - draft     → scheduled / cancelled
 *  - scheduled → cancelled / draft
 * (sending / sent / failed への遷移は send route が担うため API からは不可)
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["scheduled", "cancelled"]),
  scheduled: new Set(["cancelled", "draft"]),
};

// ─── GET: 配信一覧 (新しい順 / channel クエリで絞り込み) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const channelParam = (url.searchParams.get("channel") ?? "").trim();
    const channel = (NOTIFICATION_CHANNELS as readonly string[]).includes(channelParam)
      ? (channelParam as NotificationChannel)
      : null;
    const statusParam = (url.searchParams.get("status") ?? "").trim();
    const status = (NOTIFICATION_BROADCAST_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as NotificationBroadcastStatus)
      : null;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("notification_broadcasts")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (channel) query = query.eq("channel", channel);
    if (status) query = query.eq("status", status);

    const { data: broadcasts, error } = await query;
    if (error) return apiInternalError(error, "notification-broadcasts GET");

    return apiJson(
      { broadcasts: broadcasts ?? [] },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "notification-broadcasts GET");
  }
}

// ─── POST: 配信作成 (scheduled_at があれば scheduled、無ければ draft) ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = notificationBroadcastCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { name, channel, subject, message_text, segment_json, scheduled_at } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const status: NotificationBroadcastStatus = scheduled_at ? "scheduled" : "draft";

    const { data: created, error } = await admin
      .from("notification_broadcasts")
      .insert({
        tenant_id: caller.tenantId,
        name,
        channel,
        subject,
        message_text,
        segment_json,
        scheduled_at,
        status,
        sent_count: 0,
        failed_count: 0,
        created_by: caller.userId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "notification-broadcasts POST");

    return apiJson({ ok: true, broadcast: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "notification-broadcasts POST");
  }
}

// ─── PATCH: フィールド更新 / ステータス遷移 ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = notificationBroadcastUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 現在の状態を取得 (ステータス遷移の妥当性 / 編集可能性チェック用)。
    const { data: existing, error: fetchErr } = await admin
      .from("notification_broadcasts")
      .select("id, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "notification-broadcasts PATCH fetch");
    if (!existing) return apiValidationError("対象の配信が見つかりません。");

    const currentStatus = existing.status as string;

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    // 内容編集は未配信 (draft / scheduled) のみ許可する。
    const hasContentEdit = Object.keys(fields).some((k) => fields[k as keyof typeof fields] !== undefined);
    if (hasContentEdit && currentStatus !== "draft" && currentStatus !== "scheduled") {
      return apiValidationError("配信済み・配信中の内容は編集できません。");
    }

    // ステータス遷移の妥当性を検証する。
    if (status !== undefined && status !== currentStatus) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.has(status)) {
        return apiValidationError(`「${currentStatus}」から「${status}」への変更はできません。`);
      }
      updates.status = status;
    }

    const { data: updated, error } = await admin
      .from("notification_broadcasts")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "notification-broadcasts PATCH");
    if (!updated) return apiValidationError("対象の配信が見つかりません。");

    return apiJson({ ok: true, broadcast: updated });
  } catch (e) {
    return apiInternalError(e, "notification-broadcasts PATCH");
  }
}
