import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";

/** GET: 全テナントのテンプレートオーダー一覧（管理者用） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("管理者権限が必要です。");
    }

    const admin = getAdminClient();

    // 個別オーダーのログ取得
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    const wantLogs = url.searchParams.get("logs");
    if (orderId && wantLogs) {
      const { data: logs } = await admin
        .from("template_order_logs")
        .select("id, order_id, action, from_status, to_status, actor, message, meta_json, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(50);
      return apiOk({ logs: logs ?? [] });
    }

    const { data: orders, error } = await admin
      .from("template_orders")
      .select("*, tenants:tenant_id(name, slug)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    // サブスクリプション一覧も取得
    const { data: subs } = await admin
      .from("tenant_option_subscriptions")
      .select("*, tenants:tenant_id(name, slug)")
      .order("created_at", { ascending: false })
      .limit(100);

    return apiOk({ orders: orders ?? [], subscriptions: subs ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/template-orders GET");
  }
}

/** PUT: オーダーステータス更新（管理者用） */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { order_id, status, notes, assigned_to } = body;

    if (!order_id || !status) {
      return apiValidationError("order_id と status は必須です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();
    if (caller.role !== "owner" && caller.role !== "admin") {
      return apiForbidden("管理者権限が必要です。");
    }

    const admin = getAdminClient();

    // 現在のステータスを取得
    const { data: current } = await admin
      .from("template_orders")
      .select("status")
      .eq("id", order_id)
      .single();

    if (!current) return apiForbidden("オーダーが見つかりません。");

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) update.notes = notes;
    if (assigned_to !== undefined) update.assigned_to = assigned_to;
    if (status === "active") update.completed_at = new Date().toISOString();

    const { error } = await admin
      .from("template_orders")
      .update(update)
      .eq("id", order_id);

    if (error) throw error;

    // ログ記録
    await admin
      .from("template_order_logs")
      .insert({
        order_id,
        action: "status_change",
        from_status: current.status,
        to_status: status,
        actor: `admin:${caller.userId}`,
        message: notes ?? null,
      });

    return apiOk({ order_id, status });
  } catch (e) {
    return apiInternalError(e, "admin/template-orders PUT");
  }
}
