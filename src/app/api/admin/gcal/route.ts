import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { requireAal2OrResponse } from "@/lib/auth/stepUpGuard";
import { writeGcalRefreshToken } from "@/lib/security/tenantPrivateSecrets";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiValidationError,
  apiError,
} from "@/lib/api/response";
import {
  getAuthUrl,
  pullEventsFromCalendar,
  pushReservationsToCalendar,
  listCalendars,
  normalizeReadCalendars,
} from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from / to (YYYY-MM-DD) が必要です");

const gcalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("list-calendars") }),
  z.object({ action: z.literal("set-calendar"), calendar_id: z.string().min(1, "calendar_id が必要です") }),
  z.object({
    action: z.literal("set-read-calendars"),
    // 衝突チェック用の追加カレンダー（メイン=書き込み先とは別）。mode=full は内容も同期、busy は時間だけ押さえ予定名を隠す。
    read_calendars: z
      .array(z.object({ id: z.string().min(1), mode: z.enum(["full", "busy"]) }))
      .max(20, "追加カレンダーは20件までです"),
  }),
  z.object({ action: z.literal("sync"), from: isoDate, to: isoDate }),
  z.object({ action: z.literal("push"), from: isoDate, to: isoDate }),
]);

/**
 * GET /api/admin/gcal
 * 連携状態を取得。OAuth callback は /api/admin/gcal/callback に一本化する。
 */
export async function GET() {
  try {
    // 通常のステータス取得
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden("テナントオーナーのみ操作できます。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("gcal_sync_enabled, gcal_calendar_id, gcal_last_synced_at, gcal_read_calendars")
      .eq("id", caller.tenantId)
      .single();

    // 最終同期日時を取得
    const { data: lastSync } = await admin
      .from("gcal_sync_log")
      .select("created_at, action, status")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return apiOk({
      connected: !!tenant?.gcal_sync_enabled,
      calendar_id: tenant?.gcal_calendar_id || null,
      read_calendars: normalizeReadCalendars(tenant?.gcal_read_calendars),
      last_synced_at: tenant?.gcal_last_synced_at || lastSync?.created_at || null,
    });
  } catch (e) {
    return apiInternalError(e, "gcal status");
  }
}

/**
 * POST /api/admin/gcal
 * アクション: connect / disconnect / sync / set-calendar
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden("テナントオーナーのみ操作できます。");
    const stepUpDenied = await requireAal2OrResponse(supabase);
    if (stepUpDenied) return stepUpDenied;

    const parsed = gcalActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data = parsed.data;

    if (data.action === "connect") {
      // 環境変数チェック
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return apiError({
          code: "internal_error",
          message: "Googleカレンダー連携の環境変数（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）が未設定です。",
          status: 503,
        });
      }
      // OAuth 認可URL を返す
      const state = createOAuthState({ tenantId: caller.tenantId, provider: "gcal", userId: caller.userId });
      const url = getAuthUrl(state);
      return apiOk({ auth_url: url });
    }

    if (data.action === "disconnect") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await writeGcalRefreshToken(admin, caller.tenantId, null);
      await admin.from("tenants").update({ gcal_sync_enabled: false }).eq("id", caller.tenantId);
      return apiOk({ connected: false });
    }

    if (data.action === "list-calendars") {
      const calendars = await listCalendars(caller.tenantId);
      return apiOk({ calendars });
    }

    if (data.action === "set-calendar") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: prev } = await admin.from("tenants").select("gcal_calendar_id").eq("id", caller.tenantId).single();
      const oldId = (prev?.gcal_calendar_id as string) || null;
      await admin.from("tenants").update({ gcal_calendar_id: data.calendar_id }).eq("id", caller.tenantId);
      // メイン（書き込み先）を切替えたら、旧メイン由来の未来の取り込み予約を掃除（新メインは次回 pull で入る）。
      if (oldId && oldId !== data.calendar_id) {
        await admin
          .from("reservations")
          .delete()
          .eq("tenant_id", caller.tenantId)
          .eq("source", "gcal")
          .eq("gcal_calendar_id", oldId)
          .gte("scheduled_date", new Date().toISOString().slice(0, 10));
      }
      return apiOk({ calendar_id: data.calendar_id });
    }

    if (data.action === "set-read-calendars") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: tenant } = await admin
        .from("tenants")
        .select("gcal_calendar_id, gcal_read_calendars")
        .eq("id", caller.tenantId)
        .single();
      const mainId = (tenant?.gcal_calendar_id as string) || undefined;
      // メイン（書き込み先）と同一・重複・不正値を除外して正規化。
      const normalized = normalizeReadCalendars(data.read_calendars, mainId);
      const prevIds = normalizeReadCalendars(tenant?.gcal_read_calendars).map((c) => c.id);
      const nextIds = new Set(normalized.map((c) => c.id));
      const removed = prevIds.filter((id) => !nextIds.has(id));

      await admin.from("tenants").update({ gcal_read_calendars: normalized }).eq("id", caller.tenantId);

      // 外したカレンダー由来の「未来の」取り込み予約だけ掃除（他カレンダー・手動予約・過去は残す）。
      if (removed.length > 0) {
        await admin
          .from("reservations")
          .delete()
          .eq("tenant_id", caller.tenantId)
          .eq("source", "gcal")
          .in("gcal_calendar_id", removed)
          .gte("scheduled_date", new Date().toISOString().slice(0, 10));
      }
      return apiOk({ read_calendars: normalized });
    }

    if (data.action === "sync") {
      // 双方向同期: push（Ledra→GCal）+ pull（GCal→Ledra）
      const pushed = await pushReservationsToCalendar(caller.tenantId, data.from, data.to);
      const pullResult = await pullEventsFromCalendar(caller.tenantId, data.from, data.to);

      // 最終同期日時を更新
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await admin.from("tenants").update({ gcal_last_synced_at: new Date().toISOString() }).eq("id", caller.tenantId);

      return apiOk({
        pushed,
        imported: pullResult.imported,
        updated: pullResult.updated,
        cancelled: pullResult.cancelled,
        skipped: pullResult.skipped,
        synced_at: new Date().toISOString(),
      });
    }

    // data.action === "push"
    const pushed = await pushReservationsToCalendar(caller.tenantId, data.from, data.to);
    return apiOk({ pushed, synced_at: new Date().toISOString() });
  } catch (e) {
    return apiInternalError(e, "gcal action");
  }
}
