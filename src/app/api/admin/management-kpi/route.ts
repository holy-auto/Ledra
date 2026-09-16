
import { apiJson, apiInternalError } from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (_req, { caller }) => {
    try {

      // 関数側にテナントの検査が無く、引数の tenant_id をそのまま使う。
      // service_role 専用にしたので、権限確認済みのここからサービスロールで呼ぶ
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin.rpc("management_kpi_stats", {
        p_tenant_id: caller.tenantId,
      });

      if (error) return apiInternalError(error, "management-kpi RPC");

      // Explicit short cache — dashboard refresh smoothing.
      return apiJson(data, { cacheControl: "private, max-age=10, stale-while-revalidate=30" });
    } catch (e: unknown) {
      return apiInternalError(e, "management-kpi GET");
    }
  },
  { routeName: "admin/management-kpi GET" },
);
