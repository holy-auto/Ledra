import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Get all certificates with service_price and tenant prefecture info
    const { data: certs } = await supabase
      .from("certificates")
      .select("service_price, tenant_id, created_at")
      .eq("tenant_id", caller.tenantId)
      .not("service_price", "is", null)
      .gt("service_price", 0);

    // Get tenant info with prefecture
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, prefecture, name");

    const tenantMap = new Map<string, string>();
    for (const t of tenants ?? []) {
      if (t.prefecture) tenantMap.set(t.id, t.prefecture);
    }

    // Build regional price stats
    const regionData = new Map<string, number[]>();
    for (const pref of PREFECTURES) {
      regionData.set(pref, []);
    }

    for (const cert of certs ?? []) {
      const pref = tenantMap.get(cert.tenant_id);
      if (pref && regionData.has(pref)) {
        regionData.get(pref)!.push(cert.service_price);
      }
    }

    const regionalStats = PREFECTURES.map((pref) => {
      const prices = regionData.get(pref) ?? [];
      if (prices.length === 0) {
        return { prefecture: pref, count: 0, avg: 0, min: 0, max: 0 };
      }
      const sum = prices.reduce((a, b) => a + b, 0);
      return {
        prefecture: pref,
        count: prices.length,
        avg: Math.round(sum / prices.length),
        min: Math.min(...prices),
        max: Math.max(...prices),
      };
    });

    // Overall stats
    const allPrices = (certs ?? []).map((c: any) => c.service_price as number);
    const overall = allPrices.length > 0
      ? {
          count: allPrices.length,
          avg: Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length),
          min: Math.min(...allPrices),
          max: Math.max(...allPrices),
        }
      : { count: 0, avg: 0, min: 0, max: 0 };

    return NextResponse.json({ regionalStats, overall });
  } catch (e) {
    return apiInternalError(e, "price-stats");
  }
}
