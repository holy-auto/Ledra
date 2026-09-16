

import { apiJson, apiInternalError, apiNotFound } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[id]/summary
 *
 * Returns a comprehensive customer summary including stats.
 */
export const GET = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {
      const { id: customerId } = params;

      // Fetch customer
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("name, email, phone, created_at")
        .eq("id", customerId)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();

      if (custErr) {
        return apiInternalError(custErr, "customer-summary");
      }
      if (!customer) {
        return apiNotFound("顧客が見つかりません。");
      }

      // 集計は RPC に集約 (5 本の往復→1 本)。請求書合計は正しい列 documents.total を使う
      // (旧実装は存在しない total_amount を select しており total_invoices/total_spent が
      // 常に 0 になる潜在バグがあった)。
      const { data: statsRows, error: statsErr } = await supabase.rpc("customer_summary_stats", {
        p_tenant_id: caller.tenantId,
        p_customer_id: customerId,
      });
      if (statsErr) {
        return apiInternalError(statsErr, "customer-summary stats");
      }
      const s = (Array.isArray(statsRows) ? statsRows[0] : statsRows) as {
        total_certificates: number | null;
        active_certificates: number | null;
        total_vehicles: number | null;
        total_invoices: number | null;
        total_spent: number | null;
        last_visit: string | null;
      } | null;

      return apiJson({
        customer,
        stats: {
          total_certificates: Number(s?.total_certificates ?? 0),
          active_certificates: Number(s?.active_certificates ?? 0),
          total_vehicles: Number(s?.total_vehicles ?? 0),
          total_invoices: Number(s?.total_invoices ?? 0),
          total_spent: Number(s?.total_spent ?? 0),
          last_visit: s?.last_visit ?? null,
        },
      });
    } catch (e) {
      return apiInternalError(e, "customer-summary");
    }
  },
  { minRole: "staff", routeName: "customer-summary" },
);
