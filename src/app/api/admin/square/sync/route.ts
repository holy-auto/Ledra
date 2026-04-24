import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiError,
  apiValidationError,
} from "@/lib/api/response";
import { enqueueSquareSync } from "@/lib/qstash/publish";

export const dynamic = "force-dynamic";

// ─── POST: Square 手動同期 (QStash キューイング) ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    // Rate limit: 5 req/min per tenant
    const limited = await checkRateLimit(req, "auth", `square-sync:${caller.tenantId}`);
    if (limited) return limited;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 接続情報を確認
    const { data: conn } = await admin
      .from("square_connections")
      .select("id, square_location_ids, status")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!conn || conn.status !== "active") {
      return apiError({
        code: "validation_error",
        message: "Squareが接続されていません。先に連携を行ってください。",
        status: 400,
      });
    }

    const locationIds = (conn.square_location_ids as string[]) ?? [];
    if (locationIds.length === 0) {
      return apiValidationError("Squareのロケーション情報がありません。再連携してください。");
    }

    // 重複実行防止：処理中のジョブがあれば即座にそのIDを返す
    const { data: running } = await admin
      .from("square_sync_runs")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("status", "processing")
      .maybeSingle();

    if (running) {
      return apiOk({
        message: "同期が既に実行中です",
        sync_run_id: running.id as string,
      });
    }

    // リクエストボディから日付範囲を取得（デフォルト: 過去90日）
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const defaultTo = now.toISOString().slice(0, 10);
    const from = (body?.from as string) || defaultFrom;
    const to = (body?.to as string) || defaultTo;

    // sync run レコード作成（Worker が処理開始時に "processing" に更新する）
    const { data: syncRun, error: syncRunErr } = await admin
      .from("square_sync_runs")
      .insert({
        tenant_id: caller.tenantId,
        status: "queued",
        trigger_type: "manual",
        triggered_by: caller.userId,
        sync_from: new Date(from).toISOString(),
        sync_to: new Date(to).toISOString(),
      })
      .select("id")
      .single();

    if (syncRunErr) {
      return apiInternalError(syncRunErr, "square sync run create");
    }

    await enqueueSquareSync({
      job_id: syncRun.id,
      tenant_id: caller.tenantId,
    });

    console.info(`[square:sync] tenant=${caller.tenantId} queued job=${syncRun.id}`);

    return apiOk({
      message: "Square同期を開始しました",
      sync_run_id: syncRun.id as string,
    });
  } catch (e) {
    return apiInternalError(e, "square sync POST");
  }
}
