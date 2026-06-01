import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { buildCaseTimeline } from "@/lib/admin/caseTimeline";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/reservations/<id>/timeline
 * 案件（予約）の連鎖タイムライン（予約→施工→証明書→請求→フォロー）。
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const { data: reservation } = await supabase
      .from("reservations")
      .select("id, status, customer_id, vehicle_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!reservation) return apiNotFound("reservation not found");

    // 証明書: reservation_id で直接紐付け（最新 1 件）
    const { data: cert } = await supabase
      .from("certificates")
      .select("id, public_id, status, created_at")
      .eq("reservation_id", id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 請求: 予約と同じ顧客(+車両)の invoice を近似紐付け（最新 1 件）
    let invoice: { id: string; status: string | null } | null = null;
    if (reservation.customer_id) {
      let q = supabase
        .from("documents")
        .select("id, status, created_at")
        .eq("doc_type", "invoice")
        .eq("tenant_id", tenantId)
        .eq("customer_id", reservation.customer_id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (reservation.vehicle_id) q = q.eq("vehicle_id", reservation.vehicle_id);
      const { data } = await q.maybeSingle();
      invoice = data ? { id: data.id as string, status: (data.status as string | null) ?? null } : null;
    }

    // フォロー: 証明書の発行後フォロー (post_issue) の最新ログ
    let followUp: { status: string | null } | null = null;
    if (cert?.id) {
      const { data } = await supabase
        .from("notification_logs")
        .select("status, created_at")
        .eq("type", "post_issue")
        .eq("target_id", cert.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      followUp = data ? { status: (data.status as string | null) ?? null } : null;
    }

    const steps = buildCaseTimeline({
      reservation: { status: reservation.status as string | null },
      certificate: cert ? { public_id: cert.public_id as string, status: cert.status as string | null } : null,
      invoice,
      followUp,
    });

    return apiJson({ steps });
  } catch (e) {
    return apiInternalError(e, "reservations/[id]/timeline GET");
  }
}
