import type { TemplateOptionType, OptionSubscriptionStatus } from "@/types/templateOption";
import { createAdminClient } from "@/lib/supabase/admin";

/** テンプレートオプション契約情報 */
export type TemplateOptionStatus = {
  hasSubscription: boolean;
  optionType: TemplateOptionType | null;
  status: OptionSubscriptionStatus | null;
  templateConfigId: string | null;
};

/**
 * テナントのテンプレートオプション契約状況を取得
 */
export async function getTemplateOptionStatus(tenantId: string): Promise<TemplateOptionStatus> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenant_option_subscriptions")
    .select("option_type, status, template_config_id")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { hasSubscription: false, optionType: null, status: null, templateConfigId: null };
  }

  return {
    hasSubscription: true,
    optionType: data.option_type as TemplateOptionType,
    status: data.status as OptionSubscriptionStatus,
    templateConfigId: data.template_config_id as string | null,
  };
}

/** テスト発行上限 */
export const TEST_ISSUE_LIMITS: Record<TemplateOptionType, number> = {
  preset: 3,
  custom: 5,
};

/** テンプレート数上限 */
export const TEMPLATE_COUNT_LIMITS: Record<TemplateOptionType, number> = {
  preset: 1,
  custom: 1,
};

/** メンテナンスURL上限 */
export const MAINTENANCE_URL_LIMITS: Record<TemplateOptionType, number> = {
  preset: 1,
  custom: 3,
};

/** 文言文字数上限 */
export const TEXT_LIMITS: Record<TemplateOptionType, { warranty: number; notice: number }> = {
  preset: { warranty: 200, notice: 200 },
  custom: { warranty: 500, notice: 500 },
};

/** カスタムセクション上限 */
export const CUSTOM_SECTION_LIMITS: Record<TemplateOptionType, number> = {
  preset: 0,
  custom: 3,
};
