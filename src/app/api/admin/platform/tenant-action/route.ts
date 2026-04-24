import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const tenantActionSchema = z
  .object({
    tenantId: z.string().uuid("tenantId は必須です"),
    action: z.enum(["activate", "deactivate", "change_plan", "reset_billing", "send_notification"], {
      message: "不明なアクションです",
    }),
    params: z
      .object({
        plan_tier: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
        message: z.string().trim().max(2000).optional(),
      })
      .partial()
      .optional(),
  })
  .refine((v) => v.action !== "change_plan" || !!v.params?.plan_tier, {
    message: "plan_tier が必要です",
    path: ["params", "plan_tier"],
  })
  .refine((v) => v.action !== "send_notification" || !!v.params?.message, {
    message: "message が必要です",
    path: ["params", "message"],
  });

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

    const parsed = tenantActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { tenantId, action, params } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

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
        const { error } = await admin.from("tenants").update({ is_active: true }).eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} を有効化しました`, is_active: true };
        break;
      }
      case "deactivate": {
        const { error } = await admin.from("tenants").update({ is_active: false }).eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} を無効化しました`, is_active: false };
        break;
      }
      case "change_plan": {
        // zod の refine で params.plan_tier の存在を強制済み。
        const newPlan = params!.plan_tier!;
        const { error } = await admin.from("tenants").update({ plan_tier: newPlan }).eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} のプランを ${newPlan} に変更しました`, plan_tier: newPlan };
        break;
      }
      case "reset_billing": {
        const { error } = await admin.from("tenants").update({ is_active: true }).eq("id", tenantId);
        if (error) throw error;
        result = { message: `${tenant.name} の課金状態をリセットしました` };
        break;
      }
      case "send_notification": {
        const message = params!.message!;
        // Get all members of the tenant
        const { data: members } = await admin.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId);
        const userIds = (members ?? []).map((m) => m.user_id as string);
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

    return apiJson({ ok: true, action, ...result });
  } catch (e: unknown) {
    return apiInternalError(e, "platform/tenant-action POST");
  }
}
