import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

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
      return apiUnauthorized();
    }
    if (!isPlatformAdmin(caller)) {
      return apiForbidden();
    }

    const body = await req.json();
    const { tenantId, action, params } = body as {
      tenantId: string;
      action: TenantAction;
      params?: Record<string, unknown>;
    };

    if (!tenantId || !action) {
      return apiValidationError("tenantId と action は必須です");
    }

    const admin = getSupabaseAdmin();

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, name, is_active, plan_tier")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return apiNotFound("テナントが見つかりません");
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
          return apiValidationError("plan_tier が必要です");
        }
        const validPlans = ["free", "starter", "pro", "enterprise"];
        if (!validPlans.includes(newPlan)) {
          return apiValidationError("無効なプランです");
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
          return apiValidationError("message が���要です");
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
        return apiValidationError("不明なアクションです");
    }

    // Log the action to admin_audit_logs
    try {
      await admin.from("admin_audit_logs").insert({
        actor_id: caller.userId,
        actor_tenant_id: caller.tenantId,
        action: `platform.${action}`,
        target_type: "tenant",
        target_id: tenantId,
        meta: {
          tenant_name: tenant.name,
          params: params ?? {},
          result_message: result.message ?? "",
        },
      });
    } catch (auditErr) {
      // audit log failure should not block the action, but log for monitoring
      console.error("[platform/tenant-action] audit log failed:", auditErr);
    }

    return NextResponse.json({ ok: true, action, ...result });
  } catch (e: unknown) {
    return apiInternalError(e, "platform/tenant-action POST");
  }
}
