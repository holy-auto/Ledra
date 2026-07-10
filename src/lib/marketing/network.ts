import { unstable_cache } from "next/cache";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * 「証明書・施工店・メーカー・保険会社・ユーザー」が織りなすネットワークの
 * 広がりを、公開ページ (トップの要約 / /network の詳細) で見せるための集計。
 *
 * getMarketingStats() (src/lib/marketing/stats.ts) と同じ house rule に従う:
 * 取得できない値は 0 / 空配列にフォールバックし、ねつ造した数字は出さない。
 */

export type NetworkNode = {
  id: string;
  name: string;
  /** 認定/契約している施工店数 (アクティブなエッジ数) */
  shopCount: number;
};

export type RegionalNode = {
  prefecture: string;
  count: number;
};

export type NetworkStats = {
  /** 累計発行された施工証明書数 (draft を除く) */
  certificateCount: number;
  /** 有効な施工店 (テナント) 数 */
  shopCount: number;
  /** 有効なメーカー数 */
  manufacturerCount: number;
  /** 有効な保険会社数 */
  insurerCount: number;
  /** エンドユーザー (車のオーナー/顧客) 数 */
  customerCount: number;
  /** プラットフォーム利用アカウント数 (施工店スタッフ + 保険会社担当者 + メーカー担当者) */
  accountCount: number;
  /** 施工店を認定しているメーカー (認定施工店数の多い順) */
  manufacturers: NetworkNode[];
  /** 施工店と契約している保険会社 (契約施工店数の多い順) */
  insurers: NetworkNode[];
  /** 都道府県別の施工店数 (多い順) */
  regions: RegionalNode[];
  isLive: boolean;
  fetchedAt: string;
};

const fallback: NetworkStats = {
  certificateCount: 0,
  shopCount: 0,
  manufacturerCount: 0,
  insurerCount: 0,
  customerCount: 0,
  accountCount: 0,
  manufacturers: [],
  insurers: [],
  regions: [],
  isLive: false,
  fetchedAt: new Date(0).toISOString(),
};

/**
 * (manufacturer_id|insurer_id, 関連先の name) の行リストを、エッジ数の多い順の
 * ノード配列にたたむ。
 *
 * ponytail: JS 側で count する（SQL GROUP BY を新設していない）。認定/契約の
 * アクティブ行数が数千を超えて全件フェッチが重くなったら、専用 RPC に
 * 集約ロジックを移す（他の platform_* RPC と同じ SECURITY DEFINER 集約関数）。
 */
function groupEdges(
  rows: Record<string, unknown>[] | null,
  idKey: string,
  nameOf: (row: Record<string, unknown>) => string | undefined,
): NetworkNode[] {
  if (!rows) return [];
  const byId = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const id = row[idKey];
    if (typeof id !== "string") continue;
    const existing = byId.get(id);
    if (existing) existing.count += 1;
    else byId.set(id, { name: nameOf(row) ?? "―", count: 1 });
  }
  return Array.from(byId.entries())
    .map(([id, v]) => ({ id, name: v.name, shopCount: v.count }))
    .sort((a, b) => b.shopCount - a.shopCount);
}

const fetchNetworkStats = unstable_cache(
  async (): Promise<NetworkStats> => {
    try {
      let supabase;
      try {
        supabase = createServiceRoleAdmin("marketing public network visualization page — aggregated stats");
      } catch {
        return fallback;
      }

      const [
        shops,
        certs,
        manufacturersCount,
        insurersCount,
        customers,
        tenantMembers,
        insurerUsers,
        manufacturerMembers,
        regionalRes,
        mctRes,
        itcRes,
      ] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("certificates").select("id", { count: "exact", head: true }).neq("status", "draft"),
        supabase.from("manufacturers").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("insurers").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("tenant_memberships").select("id", { count: "exact", head: true }),
        supabase.from("insurer_users").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("manufacturer_memberships").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.rpc("platform_regional_stats"),
        supabase
          .from("manufacturer_certified_tenants")
          .select("manufacturer_id, manufacturers(name)")
          .eq("status", "active"),
        supabase.from("insurer_tenant_contracts").select("insurer_id, insurers(name)").eq("status", "active"),
      ]);

      const manufacturers = groupEdges(mctRes.data, "manufacturer_id", (r) => {
        const m = r.manufacturers as { name?: string } | { name?: string }[] | null;
        return Array.isArray(m) ? m[0]?.name : m?.name;
      });
      const insurers = groupEdges(itcRes.data, "insurer_id", (r) => {
        const i = r.insurers as { name?: string } | { name?: string }[] | null;
        return Array.isArray(i) ? i[0]?.name : i?.name;
      });

      const regions = ((regionalRes.data ?? []) as RegionalNode[]).filter((r) => r.prefecture !== "未設定");

      return {
        certificateCount: certs.count ?? 0,
        shopCount: shops.count ?? 0,
        manufacturerCount: manufacturersCount.count ?? 0,
        insurerCount: insurersCount.count ?? 0,
        customerCount: customers.count ?? 0,
        accountCount: (tenantMembers.count ?? 0) + (insurerUsers.count ?? 0) + (manufacturerMembers.count ?? 0),
        manufacturers,
        insurers,
        regions,
        isLive: true,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return fallback;
    }
  },
  ["marketing-network-stats-v1"],
  { revalidate: 3600 },
);

export async function getNetworkStats(): Promise<NetworkStats> {
  return fetchNetworkStats();
}
