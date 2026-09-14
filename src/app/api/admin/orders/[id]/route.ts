import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

/**
 * 発注に紐づく施工証明の取得列。**相手方テナントにも返る**ので顧客 PII は載せない。
 *
 * この literal が唯一の実体で、開示してよいと判断した根拠と禁止列は
 * src/lib/orders/orderCertificates.ts、両者の一致を強制する番人はその __tests__。
 * ここに literal で置いてあるのは、scripts/check-schema.mjs が select の列を
 * 同一ファイル内の const からしか解決できないため。
 */
const ORDER_CERTIFICATE_SELECT = "public_id, status, service_type, craftsman_name, created_at";

/**
 * GET /api/admin/orders/[id]
 * 受発注の詳細取得（帳票・チャット最新・評価を含む）
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 注文取得 (admin client to bypass RLS)
    const { data: order, error } = await admin
      .from("job_orders")
      .select(
        "id, public_id, from_tenant_id, to_tenant_id, title, description, category, budget, deadline, vehicle_id, status, cancelled_by, cancel_reason, vendor_completed_at, client_approved_at, payment_status, payment_method, accepted_amount, payment_confirmed_by_client, payment_confirmed_by_vendor, reservation_id, created_at, updated_at",
      )
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (error || !order) {
      return apiNotFound("not_found");
    }

    // 関連テナント情報
    const mapTenant = (d: Record<string, unknown> | null) =>
      d ? { id: d.id, company_name: d.name, slug: d.slug } : null;

    const [fromTenant, toTenant] = await Promise.all([
      admin.from("tenants").select("id, name, slug").eq("id", order.from_tenant_id).single(),
      order.to_tenant_id
        ? admin.from("tenants").select("id, name, slug").eq("id", order.to_tenant_id).single()
        : Promise.resolve({ data: null }),
    ]);

    // 紐づく帳票
    const { data: documents } = await admin
      .from("documents")
      .select("id, doc_type, doc_number, status, total, issued_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false });

    // 紐づく施工証明。**相手方テナントにも返る**ので列を絞る（PII の理由は
    // orderCertificates.ts）。詳細は PII を落としてある公開ページ /c/[public_id] へ。
    const { data: certificates } = await admin
      .from("certificates")
      .select(ORDER_CERTIFICATE_SELECT)
      .eq("job_order_id", id)
      .neq("status", "void")
      // is_hidden は「ミスがあった証明書を一覧から外す」フラグ（20260619000000）。
      // 発行元が引っ込めたものを相手方に出したままにしない（自社の一覧と同じ扱い）。
      .eq("is_hidden", false)
      .order("created_at", { ascending: false });

    // チャット最新5件
    const { data: recentMessages } = await admin
      .from("chat_messages")
      .select("id, sender_tenant_id, body, is_system, created_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    // 評価
    const { data: reviews } = await admin
      .from("order_reviews")
      .select("id, reviewer_tenant_id, reviewed_tenant_id, rating, comment, published_at")
      .eq("job_order_id", id);

    // 監査ログ（最新20件）
    const { data: auditLog } = await admin
      .from("order_audit_log")
      .select("action, old_value, new_value, actor_tenant_id, created_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    // 紐づく仮押さえ（承認待ち枠）＋変換済み本予約
    const { data: holdRow } = await admin
      .from("reservation_holds")
      .select("id, scheduled_date, start_time, end_time, status, expires_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let reservation = null;
    if (order.reservation_id) {
      const { data: resv } = await admin
        .from("reservations")
        .select("id, scheduled_date, start_time, end_time, all_day, status")
        .eq("id", order.reservation_id)
        .maybeSingle();
      reservation = resv;
    }

    // 相手方のパートナースコアを取得
    const counterpartyId = order.from_tenant_id === tenantId ? order.to_tenant_id : order.from_tenant_id;
    let counterpartyScore = null;
    if (counterpartyId) {
      const { data: ps } = await admin
        .from("partner_scores")
        .select("total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count")
        .eq("tenant_id", counterpartyId)
        .maybeSingle();
      counterpartyScore = ps;
    }

    return apiJson({
      order,
      from_tenant: mapTenant(fromTenant.data),
      to_tenant: mapTenant(toTenant.data),
      documents: documents ?? [],
      certificates: certificates ?? [],
      recent_messages: (recentMessages ?? []).reverse(),
      reviews: reviews ?? [],
      audit_log: auditLog ?? [],
      is_from: order.from_tenant_id === tenantId,
      is_to: order.to_tenant_id != null && order.to_tenant_id === tenantId,
      counterparty_score: counterpartyScore,
      hold: holdRow ?? null,
      reservation: reservation ?? null,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "orders/[id] GET");
  }
}
