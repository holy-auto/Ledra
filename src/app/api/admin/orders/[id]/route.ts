import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

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

    // 注文取得
    const { data: order, error } = await supabase
      .from("job_orders")
      .select("*")
      .eq("id", id)
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // 関連テナント情報
    const [fromTenant, toTenant] = await Promise.all([
      supabase.from("tenants").select("id, company_name, slug").eq("id", order.from_tenant_id).single(),
      supabase.from("tenants").select("id, company_name, slug").eq("id", order.to_tenant_id).single(),
    ]);

    // 紐づく帳票
    const { data: documents } = await supabase
      .from("documents")
      .select("id, doc_type, doc_number, status, total, issued_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false });

    // チャット最新5件
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("id, sender_tenant_id, body, is_system, created_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    // 評価
    const { data: reviews } = await supabase
      .from("order_reviews")
      .select("id, reviewer_tenant_id, reviewed_tenant_id, rating, comment, published_at")
      .eq("job_order_id", id);

    // 監査ログ（最新20件）
    const { data: auditLog } = await supabase
      .from("order_audit_log")
      .select("action, old_value, new_value, actor_tenant_id, created_at")
      .eq("job_order_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      order,
      from_tenant: fromTenant.data,
      to_tenant: toTenant.data,
      documents: documents ?? [],
      recent_messages: (recentMessages ?? []).reverse(),
      reviews: reviews ?? [],
      audit_log: auditLog ?? [],
      is_from: order.from_tenant_id === tenantId,
      is_to: order.to_tenant_id === tenantId,
    });
  } catch (e: unknown) {
    console.error("[orders/[id]] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
