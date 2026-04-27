import { unstable_cache } from "next/cache";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * マーケティングページ用の成長指標を取得。
 *
 * 設計意図 (重要):
 *   Ledra は意図的に「ゼロからの成長過程」を訪問者に見せる方針。
 *   小さい数字を隠す閾値ロジックは持たず、現在値・直近の伸び・次のマイルストーン
 *   を透明に表示する。先行導入パートナーに「歴史の最初の数字」になってもらう
 *   ナラティブを成立させるため、表示用の文字列ではなく生の数値を返す。
 */

export type MarketingStats = {
  /** 有効テナント (施工店) 数 */
  shopCount: number;
  /** 累計発行された証明書相当のレコード数 */
  certificateCount: number;
  /** 過去30日に追加されたテナント数 */
  shopsLast30Days: number;
  /** 過去30日に発行された証明書相当のレコード数 */
  certificatesLast30Days: number;
  /** DB から取れたかどうか (false の場合は 0 を返している) */
  isLive: boolean;
  /** 取得時刻 (ISO) — 「いつ時点の数字か」を明示する */
  fetchedAt: string;
};

const fallback: MarketingStats = {
  shopCount: 0,
  certificateCount: 0,
  shopsLast30Days: 0,
  certificatesLast30Days: 0,
  isLive: false,
  fetchedAt: new Date(0).toISOString(),
};

const fetchMarketingStats = unstable_cache(
  async (): Promise<MarketingStats> => {
    try {
      let supabase;
      try {
        supabase = createServiceRoleAdmin("marketing public forms — anonymous leads / aggregated stats");
      } catch {
        return fallback;
      }

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [tenants, certs, tenants30, certs30] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("insurance_cases").select("id", { count: "exact", head: true }),
        supabase
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gte("created_at", since),
        supabase.from("insurance_cases").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);

      return {
        shopCount: tenants.count ?? 0,
        certificateCount: certs.count ?? 0,
        shopsLast30Days: tenants30.count ?? 0,
        certificatesLast30Days: certs30.count ?? 0,
        isLive: true,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return fallback;
    }
  },
  ["marketing-stats-v2"],
  { revalidate: 3600 },
);

export async function getMarketingStats(): Promise<MarketingStats> {
  return fetchMarketingStats();
}

/** 成長マイルストーン (公開ロードマップ) — Ledra が向かう次の数字を率直に提示する */
export type Milestone = {
  shop?: number;
  cert?: number;
  label: string;
  caption: string;
};

export const SHOP_MILESTONES: Milestone[] = [
  { shop: 1, label: "1社目", caption: "最初のパートナーと、業界の記録文化を始める。" },
  { shop: 10, label: "10社", caption: "業態を超えた共通言語が芽吹く。" },
  { shop: 50, label: "50社", caption: "地域で「Ledra ありますか？」が成立する。" },
  { shop: 100, label: "100社", caption: "業界横断のネットワーク効果が立ち上がる。" },
  { shop: 500, label: "500社", caption: "施工品質の客観評価がインフラになる。" },
  { shop: 1000, label: "1,000社", caption: "業界の標準としての地位を獲得する。" },
];

export const CERT_MILESTONES: Milestone[] = [
  { cert: 100, label: "100件", caption: "発行プロセスがチームに馴染む段階。" },
  { cert: 1000, label: "1,000件", caption: "保険会社の照会で実データが活きる段階。" },
  { cert: 10000, label: "1万件", caption: "中古車流通で価値が認知される段階。" },
  { cert: 100000, label: "10万件", caption: "業界統計として参照される段階。" },
];

export function nextMilestone(current: number, list: Milestone[], key: "shop" | "cert"): Milestone | null {
  for (const m of list) {
    const target = m[key];
    if (typeof target === "number" && current < target) return m;
  }
  return null;
}

export function progressTo(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, current / target));
}
