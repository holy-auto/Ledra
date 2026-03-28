import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/orders/[id]
 * 受発注の詳細取得（帳票・チャット最新・評価を含む）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = caller.tenantId;

    const admin = getSupabaseAdmin();

    // 注文取得 (admin client to bypass RLS)
    const { data: order, error } = await admin
      .from("job_orders")
      .select("id, order_number, from_tenant_id, to_tenant_id, title, description, category, budget, accepted_amount, deadline, status, payment_method, payment_status, payment_confirmed_by_client, payment_confirmed_by_vendor, vendor_completed_at, client_approved_at, cancel_reason, created_at")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
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

    // Fetch all related data in parallel
    const counterpartyId = order.from_tenant_id === tenantId
      ? order.to_tenant_id
      : order.from_tenant_id;

    const [
      { data: documents },
      { data: recentMessages },
      { data: reviews },
      { data: auditLog },
      counterpartyScoreResult,
    ] = await Promise.all([
      admin
        .from("documents")
        .select("id, doc_type, doc_number, status, total, issued_at")
        .eq("job_order_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("chat_messages")
        .select("id, sender_tenant_id, body, is_system, created_at")
        .eq("job_order_id", id)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("order_reviews")
        .select("id, reviewer_tenant_id, reviewed_tenant_id, rating, comment, published_at")
        .eq("job_order_id", id),
      admin
        .from("order_audit_log")
        .select("action, old_value, new_value, actor_tenant_id, created_at")
        .eq("job_order_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      counterpartyId
        ? admin
            .from("partner_scores")
            .select("total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count")
            .eq("tenant_id", counterpartyId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const counterpartyScore = counterpartyScoreResult.data;

    return NextResponse.json({
      order,
      from_tenant: mapTenant(fromTenant.data),
      to_tenant: mapTenant(toTenant.data),
      documents: documents ?? [],
      recent_messages: (recentMessages ?? []).reverse(),
      reviews: reviews ?? [],
      audit_log: auditLog ?? [],
      is_from: order.from_tenant_id === tenantId,
      is_to: order.to_tenant_id != null && order.to_tenant_id === tenantId,
      counterparty_score: counterpartyScore,
    });
  } catch (e: unknown) {
    console.error("[orders/[id]] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
