/**
 * GET /api/admin/accounting
 * 加盟店向け: freee / マネーフォワード 両 provider の接続状態を一括取得。
 *
 * UI のメインページが「両方の連携カードを 1 画面に出す」ためのエンドポイント。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

interface IntegrationSummary {
  provider: "freee" | "moneyforward";
  status: "pending" | "active" | "disconnected" | "error" | "not_connected";
  external_company_name: string | null;
  default_sales_account_name: string | null;
  default_tax_rate: number | null;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  connected_at: string | null;
}

export const GET = withCaller(
  async (_req, { caller }) => {
    try {

      const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

      const { data, error } = await admin
        .from("accounting_integrations")
        .select(
          "provider, status, external_company_name, default_sales_account_name, default_tax_rate, auto_sync_enabled, last_synced_at, last_error, connected_at",
        )
        .eq("tenant_id", tenantId);

      if (error) return apiInternalError(error, "accounting GET");

      const byProvider = new Map<string, IntegrationSummary>();
      for (const row of data ?? []) {
        byProvider.set(row.provider as string, {
          provider: row.provider as "freee" | "moneyforward",
          status: (row.status as IntegrationSummary["status"]) ?? "not_connected",
          external_company_name: row.external_company_name as string | null,
          default_sales_account_name: row.default_sales_account_name as string | null,
          default_tax_rate: row.default_tax_rate as number | null,
          auto_sync_enabled: row.auto_sync_enabled as boolean,
          last_synced_at: row.last_synced_at as string | null,
          last_error: row.last_error as string | null,
          connected_at: row.connected_at as string | null,
        });
      }

      // 30 日以内の sync_runs サマリ
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: runs } = await admin
        .from("accounting_sync_runs")
        .select("provider, records_synced, records_failed, started_at")
        .eq("tenant_id", tenantId)
        .gte("started_at", since);

      const stats = { freee: { synced: 0, failed: 0 }, moneyforward: { synced: 0, failed: 0 } };
      for (const r of runs ?? []) {
        const p = r.provider as "freee" | "moneyforward";
        if (stats[p]) {
          stats[p].synced += (r.records_synced as number) ?? 0;
          stats[p].failed += (r.records_failed as number) ?? 0;
        }
      }

      const providers: IntegrationSummary[] = (["freee", "moneyforward"] as const).map(
        (p) =>
          byProvider.get(p) ?? {
            provider: p,
            status: "not_connected",
            external_company_name: null,
            default_sales_account_name: null,
            default_tax_rate: null,
            auto_sync_enabled: false,
            last_synced_at: null,
            last_error: null,
            connected_at: null,
          },
      );

      return apiOk({ providers, stats_30d: stats });
    } catch (e) {
      return apiInternalError(e, "accounting GET");
    }
  },
  { routeName: "accounting GET" },
);
