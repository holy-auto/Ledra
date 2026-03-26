import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";

/**
 * GET /api/admin/orders/[id]
 * 受発注の詳細取得（帳票・チャット最新・評価を含む）
 */
export async function GET(_req: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  const limited = await checkRateLimit(_req, "general");
  if (limited) return limited;

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
      .select("*")
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

    // 紐づく帳票
    const { data: documents } = await admin
      .from("documents")
      .select("id, doc_type, doc_number, status, total, issued_at")
      .eq("job_order_id", id)
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

    // 相手方のパートナースコアを取得
    const counterpartyId = order.from_tenant_id === tenantId
      ? order.to_tenant_id
      : order.from_tenant_id;
    let counterpartyScore = null;
    if (counterpartyId) {
      const { data: ps } = await admin
        .from("partner_scores")
        .select("total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count")
        .eq("tenant_id", counterpartyId)
        .maybeSingle();
      counterpartyScore = ps;
    }

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
