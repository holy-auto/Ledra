import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/notifications?unread_only=1&limit=30
 * 通知一覧取得
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "1";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, 100);

    let query = supabase
      .from("notifications")
      .select("id, user_id, tenant_id, title, body, notification_type, read_at, created_at, link_path")
      .eq("tenant_id", caller.tenantId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "list notifications");

    // 未読件数
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .is("read_at", null);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        notifications: data ?? [],
        unread_count: count ?? 0,
      },
      { headers },
    );
  } catch (e) {
    return apiInternalError(e, "list notifications");
  }
}
