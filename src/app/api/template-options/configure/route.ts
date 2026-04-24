import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import {
  apiOk,
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { templateConfigSchema, sanitizeConfig } from "@/lib/template-options/configSchema";
import { getTemplateOptionStatus } from "@/lib/template-options/templateOptionFeatures";
import type { TemplateOptionType } from "@/types/templateOption";

const saveConfigSchema = z.object({
  platform_template_id: z.string().uuid().optional(),
  config: templateConfigSchema,
  name: z.string().min(1).max(100).optional(),
});

/** GET: 現在のテンプレート設定を取得 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const { data: configs } = await supabase
      .from("tenant_template_configs")
      // Explicit column list — avoid leaking platform_template_id, updated_at,
      // created_at etc. that the UI does not consume.
      .select("id, option_type, name, config_json, layout_key, is_active, is_default, published_at")
      .eq("tenant_id", caller.tenantId)
      .order("is_default", { ascending: false });

    return apiOk({ configs: configs ?? [] });
  } catch (e) {
    return apiInternalError(e, "template-options/configure GET");
  }
}

/** POST: テンプレート設定を保存/更新 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = saveConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    // オプション契約チェック
    const optionStatus = await getTemplateOptionStatus(caller.tenantId);
    if (!optionStatus.hasSubscription) {
      return apiForbidden("テンプレートオプションの契約が必要です。先にオプションをお申し込みください。");
    }

    const optionType = optionStatus.optionType!;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // config を option_type に応じて補正
    const sanitized = sanitizeConfig(optionType, parsed.data.config);

    // 既存config があれば更新、なければ新規作成
    const { data: existing } = await admin
      .from("tenant_template_configs")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("is_default", true)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("tenant_template_configs")
        .update({
          config_json: sanitized,
          name: parsed.data.name ?? sanitized.branding.company_name,
          platform_template_id: parsed.data.platform_template_id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw error;
      return apiOk({ config_id: existing.id, updated: true });
    }

    // 新規作成
    const { data: created, error } = await admin
      .from("tenant_template_configs")
      .insert({
        tenant_id: caller.tenantId,
        platform_template_id: parsed.data.platform_template_id ?? null,
        option_type: optionType,
        name: parsed.data.name ?? sanitized.branding.company_name,
        config_json: sanitized,
        is_default: true,
        is_active: false, // プレビュー確認後に公開
      })
      .select("id")
      .single();

    if (error) throw error;

    // subscription に template_config_id を紐付け
    await admin
      .from("tenant_option_subscriptions")
      .update({ template_config_id: created.id })
      .eq("tenant_id", caller.tenantId)
      .eq("option_type", optionType);

    return apiOk({ config_id: created.id, created: true });
  } catch (e) {
    return apiInternalError(e, "template-options/configure POST");
  }
}

/** PUT: テンプレートを公開/非公開切替 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { config_id, is_active } = body;
    if (!config_id || typeof is_active !== "boolean") {
      return apiValidationError("config_id と is_active は必須です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 所有権チェック
    const { data: config } = await admin
      .from("tenant_template_configs")
      .select("id, tenant_id")
      .eq("id", config_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!config) return apiNotFound("テンプレート設定が見つかりません。");

    const update: Record<string, unknown> = {
      is_active,
      updated_at: new Date().toISOString(),
    };
    if (is_active) update.published_at = new Date().toISOString();

    const { error } = await admin.from("tenant_template_configs").update(update).eq("id", config_id);

    if (error) throw error;

    return apiOk({ config_id, is_active });
  } catch (e) {
    return apiInternalError(e, "template-options/configure PUT");
  }
}
