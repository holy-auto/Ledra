import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/templates
 *
 * 証明書発行に使うレイアウトテンプレ (tenants.templates) の軽量リスト。
 * service_packages の recommended_template_id セレクタや、
 * certificates/new の自動選択 UI から呼ばれる。
 *
 * 既存の certificates/new/page.tsx は SSR で同じ table を直接引いているため、
 * このエンドポイントは UI からのクライアントサイド fetch 用途に限定する。
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("templates")
      .select("id, name, scope, schema_json, created_at, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("name", { ascending: true });
    if (error) return apiInternalError(error, "templates list");

    return apiJson({ templates: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "templates GET");
  }
}
