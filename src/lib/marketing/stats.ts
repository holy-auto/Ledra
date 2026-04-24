import { unstable_cache } from "next/cache";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * マーケティングページ用のリアルタイム統計情報を取得
 * サーバーコンポーネントから呼び出す
 */
export type MarketingStats = {
  shopCount: string;
  certificateCount: string;
};

/** 数値を "500+" 形式にフォーマット */
function formatCount(n: number): string {
  if (n < 10) return `${n}`;
  if (n < 100) return `${Math.floor(n / 10) * 10}+`;
  if (n < 1000) return `${Math.floor(n / 100) * 100}+`;
  if (n < 10000) return `${(Math.floor(n / 1000) * 1000).toLocaleString()}+`;
  return `${(Math.floor(n / 10000) * 10000).toLocaleString()}+`;
}

const fallback: MarketingStats = { shopCount: "—", certificateCount: "—" };

/**
 * Thresholds below which a stat is treated as "not worth showing yet".
 *
 * Early-stage numbers (3社, 47件) hurt trust more than they help. We keep the
 * section hidden until the metric crosses a threshold that reads as signal
 * rather than noise.
 *
 * Override for marketing campaigns via `NEXT_PUBLIC_MARKETING_STATS_MIN_*`
 * (parsed at render time so a Vercel env change is enough to flip).
 */
const STATS_THRESHOLDS = {
  shop: Number(process.env.NEXT_PUBLIC_MARKETING_STATS_MIN_SHOP ?? 10),
  cert: Number(process.env.NEXT_PUBLIC_MARKETING_STATS_MIN_CERT ?? 1000),
} as const;

function displayOrHide(count: number | null | undefined, threshold: number): string {
  if (count == null) return "—";
  if (count < threshold) return "—";
  return formatCount(count);
}

const fetchMarketingStats = unstable_cache(
  async (): Promise<MarketingStats> => {
    try {
      let supabase;
      try {
        supabase = createServiceRoleAdmin("marketing public forms — anonymous leads / aggregated stats");
      } catch {
        return fallback;
      }

      const [tenants, certs] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("insurance_cases").select("id", { count: "exact", head: true }),
      ]);

      return {
        shopCount: displayOrHide(tenants.count, STATS_THRESHOLDS.shop),
        certificateCount: displayOrHide(certs.count, STATS_THRESHOLDS.cert),
      };
    } catch {
      return fallback;
    }
  },
  ["marketing-stats"],
  { revalidate: 3600 },
);

/**
 * DB から実データを取得してマーケティング統計を返す。
 * DB 接続に失敗した場合はフォールバック値を返す。
 * unstable_cache により1時間キャッシュされる（ISR の revalidate と同期）。
 */
export async function getMarketingStats(): Promise<MarketingStats> {
  return fetchMarketingStats();
}
