import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { getTemplateOptionStatus, MAINTENANCE_URL_LIMITS } from "@/lib/template-options/templateOptionFeatures";

const maintenanceUrlSchema = z.object({
  config_id: z.string().uuid(),
  maintenance_url: z.string().url().max(500).or(z.literal("")),
  maintenance_label: z.string().max(50).optional(),
  show_maintenance_qr: z.boolean().optional(),
});

/** POST: メンテナンスURL設定 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = maintenanceUrlSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const optionStatus = await getTemplateOptionStatus(caller.tenantId);
    if (!optionStatus.hasSubscription) {
      return apiForbidden("テンプレートオプションの契約が必要です。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 設定の所有権チェック
    const { data: config } = await admin
      .from("tenant_template_configs")
      .select("id, config_json")
      .eq("id", parsed.data.config_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!config) {
      return apiForbidden("テンプレート設定が見つかりません。");
    }

    // config_json の footer を更新
    const currentConfig = (config.config_json ?? {}) as Record<string, any>;
    const updatedConfig = {
      ...currentConfig,
      footer: {
        ...(currentConfig.footer ?? {}),
        maintenance_url: parsed.data.maintenance_url,
        maintenance_label: parsed.data.maintenance_label ?? "メンテナンス情報",
        show_maintenance_qr: parsed.data.show_maintenance_qr ?? false,
      },
    };

    const { error } = await admin
      .from("tenant_template_configs")
      .update({
        config_json: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.config_id);

    if (error) throw error;

    return apiOk({ config_id: parsed.data.config_id, updated: true });
  } catch (e) {
    return apiInternalError(e, "template-options/maintenance-url");
  }
}
