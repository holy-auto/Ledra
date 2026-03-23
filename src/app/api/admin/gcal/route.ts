import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { getAdminClient } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiError } from "@/lib/api/response";
import { getAuthUrl, exchangeCodeAndSave, pullEventsFromCalendar } from "@/lib/gcal/client";

export const dynamic = "force-dynamic";

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
      const caller = await resolveCallerBasic(supabase);

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
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const admin = getAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("gcal_sync_enabled, gcal_calendar_id")
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
      last_synced_at: lastSync?.created_at || null,
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
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "connect") {
      // 環境変数チェック
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return apiError({ code: "internal_error", message: "Googleカレンダー連携の環境変数（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）が未設定です。", status: 503 });
      }
      // OAuth 認可URL を返す
      const url = getAuthUrl(caller.tenantId);
      return apiOk({ auth_url: url });
    }

    if (action === "callback") {
      // OAuth コールバック処理
      const code = body?.code;
      if (!code) return apiValidationError("認可コードが必要です");
      await exchangeCodeAndSave(code, caller.tenantId);
      return apiOk({ connected: true });
    }

    if (action === "disconnect") {
      const admin = getAdminClient();
      await admin
        .from("tenants")
        .update({
          gcal_refresh_token: null,
          gcal_sync_enabled: false,
        })
        .eq("id", caller.tenantId);
      return apiOk({ connected: false });
    }

    if (action === "set-calendar") {
      const calendarId = body?.calendar_id;
      if (!calendarId) return apiValidationError("calendar_id が必要です");
      const admin = getAdminClient();
      await admin
        .from("tenants")
        .update({ gcal_calendar_id: calendarId })
        .eq("id", caller.tenantId);
      return apiOk({ calendar_id: calendarId });
    }

    if (action === "sync") {
      // Google Calendar から予約を pull
      const from = body?.from;
      const to = body?.to;
      if (!from || !to) return apiValidationError("from / to (YYYY-MM-DD) が必要です");
      const imported = await pullEventsFromCalendar(caller.tenantId, from, to);
      return apiOk({ imported, synced_at: new Date().toISOString() });
    }

    return apiValidationError("action は connect / callback / disconnect / set-calendar / sync のいずれかです");
  } catch (e) {
    return apiInternalError(e, "gcal action");
  }
}
