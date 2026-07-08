import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { ADDON_KEYS, enableAddon, disableAddon, type AddonKey } from "@/lib/billing/addons";
import { invalidateTenantBillingCache } from "@/lib/billing/tenantBillingCache";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

const ADDON_KEY_VALUES = Object.values(ADDON_KEYS) as [AddonKey, ...AddonKey[]];

const tenantActionSchema = z
  .object({
    tenantId: z.string().uuid("tenantId は必須です"),
    action: z.enum(
      ["activate", "deactivate", "change_plan", "reset_billing", "send_notification", "enable_addon", "disable_addon"],
      { message: "不明なアクションです" },
    ),
    params: z
      .object({
        // canonical PlanTier (src/types/billing.ts) に合わせる
        plan_tier: z.enum(["free", "starter", "standard", "pro"]).optional(),
        message: z.string().trim().max(2000).optional(),
        addon_key: z.enum(ADDON_KEY_VALUES).optional(),
        notes: z.string().trim().max(500).optional(),
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
  })
  .refine((v) => (v.action !== "enable_addon" && v.action !== "disable_addon") || !!v.params?.addon_key, {
    message: "addon_key が必要です",
    path: ["params", "addon_key"],
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

    const admin = createPlatformScopedAdmin("platform/tenant-action — activate/deactivate/change-plan any tenant");

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
      case "enable_addon": {
        const addonKey = params!.addon_key!;
        const res = await enableAddon(admin, tenantId, addonKey, params?.notes);
        if (!res.ok) throw new Error(res.error);
        result = {
          message: `${tenant.name} のアドオン「${addonKey}」を有効化しました`,
          addon_key: addonKey,
          enabled: true,
        };
        break;
      }
      case "disable_addon": {
        const addonKey = params!.addon_key!;
        const res = await disableAddon(admin, tenantId, addonKey, params?.notes);
        if (!res.ok) throw new Error(res.error);
        result = {
          message: `${tenant.name} のアドオン「${addonKey}」を無効化しました`,
          addon_key: addonKey,
          enabled: false,
        };
        break;
      }
    }

    // plan_tier / is_active を変更した操作は、共有の課金キャッシュを破棄して次リクエストに
    // 即反映させる (認証層 resolvePlanTier と billing guard が同キャッシュを参照するため)。
    if (action === "activate" || action === "deactivate" || action === "change_plan" || action === "reset_billing") {
      await invalidateTenantBillingCache(tenantId);
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
