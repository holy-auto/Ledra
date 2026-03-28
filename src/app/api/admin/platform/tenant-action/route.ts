import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TenantAction =
  | "activate"
  | "deactivate"
  | "change_plan"
  | "reset_billing"
  | "send_notification";

/**
 * POST /api/admin/platform/tenant-action
 * Execute a remote action on a tenant — platform admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!isPlatformAdmin(caller)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { tenantId, action, params } = body as {
      tenantId: string;
      action: TenantAction;
      params?: Record<string, unknown>;
    };

    if (!tenantId || !action) {
      return NextResponse.json({ error: "validation_error", message: "tenantId と action は必須です" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, is_active, plan_tier")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "not_found", message: "テナントが見つかりません" }, { status: 404 });
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case "activate": {
        const { error } = await admin
          .from("tenants")
          .update({ is_active: true })
          .eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} を有効化しました`, is_active: true };
        break;
      }
      case "deactivate": {
        const { error } = await admin
          .from("tenants")
          .update({ is_active: false })
          .eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} を無効化しました`, is_active: false };
        break;
      }
      case "change_plan": {
        const newPlan = params?.plan_tier as string;
        if (!newPlan) {
          return NextResponse.json({ error: "validation_error", message: "plan_tier が必要です" }, { status: 400 });
        }
        const validPlans = ["free", "starter", "pro", "enterprise"];
        if (!validPlans.includes(newPlan)) {
          return NextResponse.json({ error: "validation_error", message: "無効なプランです" }, { status: 400 });
        }
        const { error } = await admin
          .from("tenants")
          .update({ plan_tier: newPlan })
          .eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} のプランを ${newPlan} に変更しました`, plan_tier: newPlan };
        break;
      }
      case "reset_billing": {
        const { error } = await admin
          .from("tenants")
          .update({ is_active: true })
          .eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} の課金状態をリセットしました` };
        break;
      }
      case "send_notification": {
        const message = params?.message as string;
        if (!message) {
          return NextResponse.json({ error: "validation_error", message: "message が必要です" }, { status: 400 });
        }
        // Get all members of the tenant
        const { data: members } = await admin
          .from("tenant_memberships")
          .select("user_id")
          .eq("tenant_id", tenantId);
        const userIds = (members ?? []).map((m: any) => m.user_id);
        // Create notifications for each member
        if (userIds.length > 0) {
          const notifications = userIds.map((userId: string) => ({
            user_id: userId,
            tenant_id: tenantId,
            title: "運営からのお知らせ",
            body: message,
            type: "platform_notification",
          }));
          await admin.from("notifications").insert(notifications);
        }
        result = { message: `${tenant.name} の ${userIds.length}名に通知を送信しました` };
        break;
      }
      default:
        return NextResponse.json({ error: "validation_error", message: "不明なアクションです" }, { status: 400 });
    }

    // Log the action for audit
    try {
      await admin.from("vehicle_histories").insert({
        tenant_id: caller.tenantId,
        type: "platform_admin_action",
        title: `運営操作: ${action}`,
        description: `対象: ${tenant.name} (${tenantId}). ${result.message ?? ""}`,
        performed_at: new Date().toISOString(),
      });
    } catch {
      // audit log failure should not block the action
    }

    return NextResponse.json({ ok: true, action, ...result });
  } catch (e: unknown) {
    console.error("[platform/tenant-action] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
