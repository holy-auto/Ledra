

import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withCaller(
  async (req, { caller }) => {
    try {

      const customerId = (new URL(req.url).searchParams.get("customer_id") ?? "").trim();
      if (customerId && !UUID_RE.test(customerId)) {
        return apiValidationError("customer_id が不正です。");
      }

      // 関数側にテナントの検査が無く、引数の tenant_id をそのまま使う。
      // service_role 専用にしたので、権限確認済みのここからサービスロールで呼ぶ
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data, error } = await admin.rpc("billing_analytics_stats", {
        p_tenant_id: caller.tenantId,
        p_customer_id: customerId || null,
      });

      if (error) return apiInternalError(error, "billing-analytics RPC");

      return apiJson(data);
    } catch (e: unknown) {
      return apiInternalError(e, "billing-analytics GET");
    }
  },
  { routeName: "admin/billing-analytics GET" },
);
