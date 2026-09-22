import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/notifications — メーカー向け通知一覧＋未読数。
 *
 * tenant 版 /api/admin/notifications の姉妹。宛先を manufacturer_id で束ねる。
 * レスポンス形（read_at / link_path / notification_type）は tenant 版と同一なので、
 * NotificationBell を basePath 差し替えでそのまま使える。
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  try {
    const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "1";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, 100);

    let query = supabase
      .from("manufacturer_notifications")
      .select("id, user_id, manufacturer_id, title, body, notification_type, read_at, created_at, link_path")
      .eq("manufacturer_id", caller.manufacturerId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.is("read_at", null);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "list manufacturer notifications");

    const { count } = await supabase
      .from("manufacturer_notifications")
      .select("*", { count: "exact", head: true })
      .eq("manufacturer_id", caller.manufacturerId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .is("read_at", null);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson({ notifications: data ?? [], unread_count: count ?? 0 }, { headers });
  } catch (e) {
    return apiInternalError(e, "list manufacturer notifications");
  }
}
