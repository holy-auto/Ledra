import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";

/** GET: 既製テンプレート一覧 + テナントの契約状況 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    // 既製テンプレート一覧
    const { data: templates, error: tErr } = await supabase
      .from("platform_templates")
      .select("id, name, description, thumbnail_path, category, base_config, layout_key, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (tErr) throw tErr;

    // テナントの現在のテンプレート設定
    const { data: configs } = await supabase
      .from("tenant_template_configs")
      .select("id, platform_template_id, option_type, name, is_active, is_default")
      .eq("tenant_id", caller.tenantId);

    // テナントのオプション契約
    const { data: subs } = await supabase
      .from("tenant_option_subscriptions")
      .select("id, option_type, status, template_config_id")
      .eq("tenant_id", caller.tenantId)
      .in("status", ["active", "past_due"]);

    return apiOk({
      templates: templates ?? [],
      configs: configs ?? [],
      subscriptions: subs ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "template-options/gallery");
  }
}
