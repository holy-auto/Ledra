import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
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
export const GET = withCaller(
  async (_req, { caller }) => {
    try {

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin
        .from("templates")
        .select("id, name, scope, schema_json, created_at")
        .eq("tenant_id", caller.tenantId)
        .order("name", { ascending: true });
      if (error) return apiInternalError(error, "templates list");

      return apiJson({ templates: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "templates GET");
    }
  },
  { routeName: "templates GET" },
);
