/**
 * 運営専用: 全テナントのショップ注文（NFCタグ・グッズ等）の確認・出荷管理。
 *
 * - GET: 全テナントのショップ注文を運営ビューで一覧（テナント名・明細を含む）。
 *        ?status= で絞り込み可能。
 * - PUT: 注文ステータスを更新（出荷・完了などの運用ステータス管理）。
 *
 * セキュリティ:
 *   - isPlatformAdmin ゲート（super_admin もしくは運営テナントの owner/admin）。
 *   - shop_orders は RLS でテナント分離されているため、運営が横断参照するには
 *     createPlatformScopedAdmin（service-role）を用いる正規経路。
 *   - 変更は admin_audit_logs に記録する。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET: 全テナントのショップ注文一覧（運営専用） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden("運営権限が必要です。");

    const admin = createPlatformScopedAdmin(
      "admin/platform/shop-orders — 運営による全テナントのショップ注文一覧・出荷管理（cross-tenant）",
    );

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");

    let query = admin
      .from("shop_orders")
      .select("*, tenants:tenant_id(name, slug), shop_order_items(*)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data: orders, error } = await query;
    if (error) throw error;

    return apiOk({ orders: orders ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/platform/shop-orders GET");
  }
}

// 運営が手動で設定できるステータス。Stripe 決済ライフサイクルの中間状態
// （pending_checkout / pending_payment / checkout_failed）は手動設定の対象外。
const MANAGEABLE_STATUSES = ["pending", "paid", "processing", "shipped", "completed", "cancelled"] as const;

const updateSchema = z.object({
  order_id: z.string().uuid("注文IDが不正です。"),
  status: z.enum(MANAGEABLE_STATUSES),
});

/** PUT: 注文ステータス更新（運営専用） */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden("運営権限が必要です。");

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { order_id, status } = parsed.data;

    const admin = createPlatformScopedAdmin(
      "admin/platform/shop-orders PUT — 運営によるショップ注文ステータス更新（cross-tenant）",
    );

    const { data: current } = await admin
      .from("shop_orders")
      .select("id, status, order_number, shipped_at, completed_at")
      .eq("id", order_id)
      .maybeSingle();
    if (!current) return apiNotFound("注文が見つかりません。");

    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    // 出荷・完了の各タイムスタンプは初回遷移時のみ記録する。
    if (status === "shipped" && !current.shipped_at) patch.shipped_at = new Date().toISOString();
    if (status === "completed" && !current.completed_at) patch.completed_at = new Date().toISOString();

    const { error } = await admin.from("shop_orders").update(patch).eq("id", order_id);
    if (error) throw error;

    // 監査ログ（失敗してもアクションは止めない）。actor_tenant_id 列は
    // admin_audit_logs に存在しないため meta に格納する。
    try {
      await admin.from("admin_audit_logs").insert({
        actor_id: caller.userId,
        action: "platform.shop_order.status_change",
        target_type: "shop_order",
        target_id: order_id,
        before_data: { status: current.status },
        after_data: { status },
        meta: { order_number: current.order_number, actor_tenant_id: caller.tenantId },
      });
    } catch (auditErr) {
      console.error("[platform/shop-orders] audit log failed:", auditErr);
    }

    return apiOk({ order_id, status });
  } catch (e) {
    return apiInternalError(e, "admin/platform/shop-orders PUT");
  }
}
