
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CASE_STATUSES = ["open", "in_progress", "pending_tenant", "resolved", "closed"] as const;

/**
 * GET /api/admin/insurer-cases
 * 施工店(tenant)が、自社に紐づく保険案件 (insurer_cases.tenant_id) の一覧を取得する。
 * 保険会社側の案件を tenant 側から参照・往復するための土台 (断絶A)。
 * service-role を使うため必ず tenant_id でスコープ限定する。
 */
export const GET = withCaller(
  async (req, { caller }) => {
    try {

      const url = new URL(req.url);
      const statusParam = (url.searchParams.get("status") ?? "").trim();
      const status = (CASE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null;

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      let query = admin
        .from("insurer_cases")
        .select(
          "id, case_number, title, status, priority, category, created_at, updated_at, insurer:insurers ( id, name )",
        )
        .eq("tenant_id", caller.tenantId)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (status) query = query.eq("status", status);

      const { data: cases, error } = await query;
      if (error) return apiInternalError(error, "admin/insurer-cases GET");

      return apiJson(
        { cases: cases ?? [] },
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
      );
    } catch (e) {
      return apiInternalError(e, "admin/insurer-cases GET");
    }
  },
  { routeName: "admin/insurer-cases GET" },
);
