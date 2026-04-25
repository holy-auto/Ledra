import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
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
  exchangeCodeAndSave,
  pullEventsFromCalendar,
  pushReservationsToCalendar,
  listCalendars,
} from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from / to (YYYY-MM-DD) が必要です");

const gcalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }),
  z.object({ action: z.literal("callback"), code: z.string().min(1, "認可コードが必要です") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("list-calendars") }),
  z.object({ action: z.literal("set-calendar"), calendar_id: z.string().min(1, "calendar_id が必要です") }),
  z.object({ action: z.literal("sync"), from: isoDate, to: isoDate }),
  z.object({ action: z.literal("push"), from: isoDate, to: isoDate }),
]);

/**
 * GET /api/admin/gcal
 * - ?code=xxx → OAuth コールバック（Google からのリダイレクト）
 * - それ以外 → 連携状態を取得
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // tenantId を state として送っている

    // OAuth コールバック: Google からリダイレクトされた場合
    if (code) {
      const supabase = await createSupabaseServerClient();
      const caller = await resolveCallerWithRole(supabase);

      // state（tenantId）またはログイン中のテナントを使用
      const tenantId = state || caller?.tenantId;
      if (!tenantId) {
        return NextResponse.redirect(new URL("/admin/reservations?gcal=auth_error", req.url));
      }

      try {
        await exchangeCodeAndSave(code, tenantId);
        // 連携成功 → 予約管理ページにリダイレクト
        return NextResponse.redirect(new URL("/admin/reservations?gcal=connected", req.url));
      } catch (e) {
        console.error("[gcal] OAuth callback failed:", e);
        return NextResponse.redirect(new URL("/admin/reservations?gcal=error", req.url));
      }
    }

    // 通常のステータス取得
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("gcal_sync_enabled, gcal_calendar_id, gcal_last_synced_at")
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
    if (!requireMinRole(caller, "admin")) return apiForbidden();

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
      const url = getAuthUrl(caller.tenantId);
      return apiOk({ auth_url: url });
    }

    if (data.action === "callback") {
      await exchangeCodeAndSave(data.code, caller.tenantId);
      return apiOk({ connected: true });
    }

    if (data.action === "disconnect") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await admin
        .from("tenants")
        .update({
          gcal_refresh_token: null,
          gcal_sync_enabled: false,
        })
        .eq("id", caller.tenantId);
      return apiOk({ connected: false });
    }

    if (data.action === "list-calendars") {
      const calendars = await listCalendars(caller.tenantId);
      return apiOk({ calendars });
    }

    if (data.action === "set-calendar") {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await admin.from("tenants").update({ gcal_calendar_id: data.calendar_id }).eq("id", caller.tenantId);
      return apiOk({ calendar_id: data.calendar_id });
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
