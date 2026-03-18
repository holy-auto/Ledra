import { createClient } from "@supabase/supabase-js";

/**
 * マーケティングページ用のリアルタイム統計情報を取得
 * サーバーコンポーネントから呼び出す
 */
export type MarketingStats = {
  shopCount: string;
  certificateCount: string;
};

/** Supabase Admin で集計（RLS バイパス） */
async function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 数値を "500+" 形式にフォーマット */
function formatCount(n: number): string {
  if (n < 10) return `${n}`;
  if (n < 100) return `${Math.floor(n / 10) * 10}+`;
  if (n < 1000) return `${Math.floor(n / 100) * 100}+`;
  if (n < 10000) return `${(Math.floor(n / 1000) * 1000).toLocaleString()}+`;
  return `${(Math.floor(n / 10000) * 10000).toLocaleString()}+`;
}

/**
 * DB から実データを取得してマーケティング統計を返す。
 * DB 接続に失敗した場合はフォールバック値を返す。
 * 結果は ISR / revalidate で自動キャッシュされる想定。
 */
export async function getMarketingStats(): Promise<MarketingStats> {
  const fallback: MarketingStats = { shopCount: "—", certificateCount: "—" };

  try {
    const supabase = await getAdminClient();
    if (!supabase) return fallback;

    const [tenants, certs] = await Promise.all([
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("insurance_cases").select("id", { count: "exact", head: true }),
    ]);

    return {
      shopCount: tenants.count != null ? formatCount(tenants.count) : fallback.shopCount,
      certificateCount: certs.count != null ? formatCount(certs.count) : fallback.certificateCount,
    };
  } catch {
    return fallback;
  }
}
