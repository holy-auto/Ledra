/**
 * GET /api/admin/notification-logs/summary?days=30
 *
 * リマインド/通知の配信状況 (notification_logs) を集計して返す。
 * 「リマインドが実際に届いているか (送信/失敗/0件)」を現場・運営が把握するための可視化。
 * 集計は純ロジック (lib/admin/notificationSummary) に委ね、ここは取得のみ。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import {
  summarizeNotifications,
  labelForType,
  normalizeNotifType,
  type NotifLogRow,
} from "@/lib/admin/notificationSummary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const daysParamRaw = Number(url.searchParams.get("days"));
    const days = Number.isFinite(daysParamRaw) ? Math.max(1, Math.min(180, Math.trunc(daysParamRaw))) : 30;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const floor = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data, error } = await admin
      .from("notification_logs")
      .select("type, status, channel, sent_at, recipient_email, recipient_line_user_id")
      .eq("tenant_id", tenantId)
      .gte("sent_at", floor)
      .order("sent_at", { ascending: false })
      .limit(10000);
    if (error) return apiInternalError(error, "notification-logs summary");

    const rows = (data ?? []) as Array<
      NotifLogRow & { recipient_email: string | null; recipient_line_user_id: string | null }
    >;
    const summary = summarizeNotifications(rows);

    // 直近の失敗 (最大 20 件) を別に返す (調査導線)。
    const recent_failures = rows
      .filter((r) => r.status === "failed")
      .slice(0, 20)
      .map((r) => ({
        type: labelForType(normalizeNotifType(r.type)),
        channel: r.channel ?? null,
        sent_at: r.sent_at ?? null,
        recipient: r.recipient_email ?? r.recipient_line_user_id ?? null,
      }));

    return apiJson(
      { days, summary, recent_failures },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return apiInternalError(e, "notification-logs summary GET");
  }
}
